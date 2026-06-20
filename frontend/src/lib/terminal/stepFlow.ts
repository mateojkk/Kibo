import type { OutputLine } from '../../components/TerminalOutput';
import type { AgentWallet } from '../wallet';
import { loginWithGoogle, generateMockGoogleJwt, executeSponsoredTransaction } from '../wallet';
import { baseApi } from '../../api';
import type { Step } from './types';
import { SUI_STABLECOINS, KIBO_PACKAGE_ID, SHIELDED_POOL_ID, EXPLORER_TX } from '../suiChain';
import { Transaction } from '@mysten/sui/transactions';

type StepContext = {
  raw: string;
  step: Step;
  setStep: (step: Step) => void;
  setWallet: (wallet: AgentWallet | null) => void;
  setBusy: (busy: boolean) => void;
  push: (...lines: OutputLine[]) => void;
};

export function stepMasksInput(_step?: Step | null): boolean {
  return false;
}

export async function handleStepInput({
  raw,
  step,
  setStep,
  setWallet,
  setBusy,
  push,
}: StepContext): Promise<boolean> {
  if (!step) return false;

  const mask = stepMasksInput(step);
  push({ kind: 'input', text: mask ? '••••••' : raw });

  if (step.flow === 'connect-new') {
    if (step.step === 'email') {
      const email = raw.trim().toLowerCase();
      if (!email.includes('@') || !email.includes('.')) {
        push({ kind: 'error', text: 'enter a valid email address' });
        return true;
      }
      setStep({ flow: 'connect-new', step: 'username', email });
      push({ kind: 'info', text: 'choose your Kibo username:' });
      return true;
    }
    
    if (step.step === 'username') {
      const username = raw.trim().toLowerCase();
      if (username.length < 3) {
        push({ kind: 'error', text: 'username must be at least 3 characters' });
        return true;
      }
      if (!/^[a-z0-9_]+$/.test(username)) {
        push({ kind: 'error', text: 'username can only contain letters, numbers, and underscores' });
        return true;
      }
      setStep(null);
      setBusy(true);
      push({ kind: 'info', text: 'fetching salt and generating keypairs...' });
      try {
        const wallet = await loginWithGoogle(generateMockGoogleJwt(step.email), username);
        setWallet(wallet);
        push(
          { kind: 'success', text: `✓ wallet created for @${wallet.username}` },
          { kind: 'output', text: `  address: ${wallet.address}` },
          { kind: 'info', text: '  use Kibo privately or publicly gaslessly!' },
          { kind: 'separator' }
        );
      } catch (e: any) {
        push({ kind: 'error', text: `failed: ${e.response?.data?.detail || e.message}` });
      } finally {
        setBusy(false);
      }
      return true;
    }
  }

  if (step.flow === 'connect-load') {
    if (step.step === 'email') {
      const email = raw.trim().toLowerCase();
      if (!email.includes('@') || !email.includes('.')) {
        push({ kind: 'error', text: 'enter a valid email address' });
        return true;
      }
      setStep(null);
      setBusy(true);
      push({ kind: 'info', text: 'fetching salt and deriving keys...' });
      try {
        const wallet = await loginWithGoogle(generateMockGoogleJwt(email));
        setWallet(wallet);
        push({ kind: 'success', text: `✓ welcome back, @${wallet.username}` });
        push({ kind: 'output', text: `  address: ${wallet.address}` });
      } catch (e: any) {
        push({ kind: 'error', text: `login failed: ${e.response?.data?.detail || e.message}` });
      } finally {
        setBusy(false);
      }
      return true;
    }
  }



  if (step.flow === 'confirm-send') {
    setStep(null);
    push({ kind: 'error', text: 'transfer cancelled' });
    return true;
  }

  if (step.flow === 'claim-private' && step.step === 'salt') {
    const salt = raw.trim();
    if (salt.length !== 64) {
      push({ kind: 'error', text: 'salt must be a 64-character hex string' });
      return true;
    }
    
    setStep(null);
    setBusy(true);
    push({ kind: 'info', text: 'unshielding and claiming USDC...' });
    try {
      const token = SUI_STABLECOINS[0]; // USDC
      const amountRaw = BigInt(Math.floor(step.amount * Math.pow(10, token.decimals)));

      // 1. Calculate commitment: sha256(amountRaw + salt)
      const encoder = new TextEncoder();
      const commitmentStr = `${amountRaw}:${salt}`;
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', encoder.encode(commitmentStr));
      const commitmentBytes = new Uint8Array(hashBuffer);

      // 2. Destination address bytes (Bob's address)
      // We read it from baseApi session check or pass it.
      const meResp = await baseApi.get('/auth/me');
      const address = meResp.data?.walletAddress;
      if (!address) throw new Error('Failed to resolve active wallet address');

      const destAddrHex = address.replace('0x', '');
      const destBytes = new Uint8Array(destAddrHex.match(/.{1,2}/g)!.map((byte: string) => parseInt(byte, 16)));

      // 3. Message to sign = commitment bytes + destination address bytes
      const msg = new Uint8Array(commitmentBytes.length + destBytes.length);
      msg.set(commitmentBytes);
      msg.set(destBytes, commitmentBytes.length);

      // We need the keypair to sign
      // Since it's stored in session, we can fetch it or derive it
      const sub = localStorage.getItem('kibo_wallet_sub');
      const storedSalt = localStorage.getItem('kibo_wallet_salt');
      if (!sub || !storedSalt) throw new Error('No active wallet session found');
      
      const keypair = await deriveKeypairFromSubAndSalt(sub, storedSalt);
      const userSig = await keypair.signTransaction(msg);
      const pubKeyBytes = keypair.getPublicKey().toRawBytes();

      // We rebuild the active wallet object just for this transaction
      const mockWallet = {
        address,
        keypair,
        email: meResp.data?.email || '',
        username: meResp.data?.username || 'user',
        isZkLogin: false
      };

      // 4. Construct withdraw Transaction Block
      const tx = new Transaction();
      tx.moveCall({
        target: `${KIBO_PACKAGE_ID}::shielded_pool::withdraw`,
        typeArguments: [token.address],
        arguments: [
          tx.object(SHIELDED_POOL_ID),
          tx.pure.vector('u8', Array.from(commitmentBytes)),
          tx.pure.vector('u8', Array.from(pubKeyBytes)),
          tx.pure.vector('u8', Array.from(atob(userSig.signature), c => c.charCodeAt(0))),
          tx.pure.address(address),
          tx.pure.u64(amountRaw),
        ],
      });

      push({ kind: 'info', text: 'submitting claim transaction (sponsored gaslessly)...' });
      const digest = await executeSponsoredTransaction(mockWallet, tx);

      push(
        { kind: 'success', text: `✓ Successfully unshielded and claimed ${step.amount} ${token.symbol}!` },
        { kind: 'output', text: `  transferred to your Kibo address: ${address}` },
        { kind: 'link', text: `  explorer ↗`, href: EXPLORER_TX(digest) }
      );
    } catch (e: any) {
      push({ kind: 'error', text: `claim failed: ${e.message}` });
    } finally {
      setBusy(false);
    }
    return true;
  }

  return true;
}

// Re-import helper to derive keypair locally
async function deriveKeypairFromSubAndSalt(sub: string, salt: string): Promise<any> {
  const { deriveKeypairFromSubAndSalt: derive } = await import('../wallet');
  return derive(sub, salt);
}
