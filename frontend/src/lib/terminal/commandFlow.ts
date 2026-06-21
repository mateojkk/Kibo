import type { OutputLine } from '../../components/TerminalOutput';
import type { AgentWallet } from '../wallet';
import { getPersistedUsername, suiClient, executeSponsoredTransaction, loginWithGoogle, generateMockGoogleJwt } from '../wallet';
import { getContacts, addContact, removeContact, findContact } from '../contacts';

import { SUI_STABLECOINS, SUI_COIN, KIBO_PACKAGE_ID, SHIELDED_POOL_ID, EXPLORER_TX } from '../suiChain';
import type { Command } from '../commandParser';
import type { Step } from './types';
import { Transaction } from '@mysten/sui/transactions';

type CommandContext = {
  cmd: Command;
  wallet: AgentWallet | null;
  setWallet: (wallet: AgentWallet | null) => void;
  setStep: (step: Step) => void;
  setContacts: (contacts: Awaited<ReturnType<typeof getContacts>>) => void;
  setBusy: (busy: boolean) => void;
  setLines: (lines: OutputLine[]) => void;
  bootLines: OutputLine[];
  push: (...lines: OutputLine[]) => void;
  isPrivateMode: boolean;
};

export async function handleCommand(
  { cmd, wallet, setWallet, setStep, setContacts, setBusy, setLines, bootLines, push, isPrivateMode }: CommandContext
): Promise<boolean> {
  if (cmd.type === 'clear') {
    setLines(bootLines);
    return true;
  }

  if (cmd.type === 'help') {
    push(
      { kind: 'separator' },
      { kind: 'info', text: '  KIBO COMMAND DIRECTORY' },
      { kind: 'separator' },
      { kind: 'info', text: '  PAYMENTS' },
      { kind: 'output', text: '    balance                      view all stablecoin & SUI balances' },
      { kind: 'output', text: '    send <amount> to <contact>   send funds instantly' },
      { kind: 'output', text: '    claim <amount> <salt>        unshield and claim a private payment' },
      { kind: 'output', text: '    history                      view recent transaction history' },
      { kind: 'output', text: ' ' },
      { kind: 'info', text: '  ADDRESS BOOK' },
      { kind: 'output', text: '    contacts                     view your saved contacts' },
      { kind: 'output', text: '    add <name> <address>         add a new contact' },
      { kind: 'output', text: '    remove <name>                remove a contact' },
      { kind: 'output', text: ' ' },
      { kind: 'info', text: '  SYSTEM & SECURITY' },
      { kind: 'output', text: '    whoami                       show current wallet address' },
      { kind: 'output', text: '    pin set                      enable transaction pin verification' },
      { kind: 'output', text: '    disconnect                   lock wallet and clear session' },
      { kind: 'separator' },
    );
    return true;
  }

  if (cmd.type === 'create') {
    if (wallet) {
      push({ kind: 'info', text: `already connected: @${wallet.username} · ${wallet.address}` });
      return true;
    }
    push({ kind: 'info', text: 'creating a new Kibo wallet. enter email:' });
    setStep({ flow: 'connect-new', step: 'email' });
    return true;
  }

  if (cmd.type === 'login') {
    if (wallet) {
      push({ kind: 'info', text: `already connected: @${wallet.username} · ${wallet.address}` });
      return true;
    }
    const lastUser = getPersistedUsername();
    if (lastUser && lastUser.includes('@')) {
      setBusy(true);
      push({ kind: 'info', text: `reconnecting @${lastUser}... fetching salt...` });
      try {
        const restoredWallet = await loginWithGoogle(generateMockGoogleJwt(lastUser));
        setWallet(restoredWallet);
        push({ kind: 'success', text: `✓ welcome back, @${restoredWallet.username}` });
        push({ kind: 'output', text: `  address: ${restoredWallet.address}` });
      } catch (e: any) {
        push({ kind: 'error', text: `reconnect failed: ${e.message}. enter email:` });
        setStep({ flow: 'connect-load', step: 'email' });
      } finally {
        setBusy(false);
      }
    } else {
      push({ kind: 'info', text: 'enter your email address:' });
      setStep({ flow: 'connect-load', step: 'email' });
    }
    return true;
  }

  if (cmd.type === 'disconnect') {
    setWallet(null);
    sessionStorage.removeItem('kibo_lines');
    setContacts([]);
    push({ kind: 'info', text: 'session cleared — wallet locked' });
    return true;
  }

  if (cmd.type === 'refresh') {
    push({ kind: 'info', text: 'reloading chat...' });
    window.location.reload();
    return true;
  }

  if (cmd.type === 'whoami') {
    if (!wallet) {
      push({ kind: 'error', text: 'no wallet — type `login` or `create`' });
    } else {
      push({ kind: 'success', text: `@${wallet.username} · ${wallet.address}` });
    }
    return true;
  }



  if (cmd.type === 'contacts') {
    try {
      const fresh = await getContacts();
      setContacts(fresh);
      if (fresh.length === 0) {
        push({ kind: 'info', text: 'address book is empty — add <name> <address>' });
      } else {
        push({ kind: 'separator' });
        fresh.forEach((c) => push({ kind: 'output', text: `  ${c.name.padEnd(16)} ${c.address}` }));
        push({ kind: 'separator' });
      }
    } catch (e: any) {
      push({ kind: 'error', text: `failed to load contacts: ${e.message || 'unauthorized'}` });
    }
    return true;
  }

  if (cmd.type === 'add') {
    // Sui address format check: 0x followed by 64 hex characters
    if (!/^0x[0-9a-fA-F]{64}$/.test(cmd.address)) {
      push({ kind: 'error', text: `invalid Sui address: ${cmd.address}` });
      return true;
    }
    setBusy(true);
    try {
      const contact = await addContact(cmd.name, cmd.address, wallet?.address);
      setContacts(await getContacts());
      push({ kind: 'success', text: `✓ ${contact.name} added (${cmd.address.slice(0, 6)}...${cmd.address.slice(-4)})` });
    } catch (e: any) {
      push({ kind: 'error', text: `failed: ${e.message}` });
    } finally { setBusy(false); }
    return true;
  }

  if (cmd.type === 'remove') {
    setBusy(true);
    try {
      const ok = await removeContact(cmd.name, wallet?.address);
      if (ok) {
        setContacts(await getContacts());
        push({ kind: 'success', text: `✓ ${cmd.name} removed` });
      } else {
        push({ kind: 'error', text: `contact not found: ${cmd.name}` });
      }
    } catch (e: any) {
      push({ kind: 'error', text: `failed: ${e.message}` });
    } finally { setBusy(false); }
    return true;
  }

  if (cmd.type === 'balance') {
    if (!wallet) { push({ kind: 'error', text: 'no wallet — type `login` or `create`' }); return true; }
    setBusy(true);
    push({ kind: 'info', text: 'fetching balances on Sui Testnet...' });
    try {
      if (cmd.tokenSymbol) {
        const token = SUI_STABLECOINS.find(
          (t) => t.symbol.toLowerCase() === cmd.tokenSymbol?.toLowerCase()
        ) || (cmd.tokenSymbol.toUpperCase() === 'SUI' ? SUI_COIN : null);
        
        if (!token) {
          push({ kind: 'error', text: `token not supported: "${cmd.tokenSymbol}"` });
          setBusy(false);
          return true;
        }
        
        const rawBal = await suiClient.getBalance({ owner: wallet.address, coinType: token.address });
        const formatted = (Number(rawBal.totalBalance) / Math.pow(10, token.decimals)).toFixed(4);
        push({ kind: 'success', text: `balance: ${formatted} ${token.symbol}` });
      } else {
        const balances = await Promise.all(
          [SUI_COIN, ...SUI_STABLECOINS].map(async (token) => {
            try {
              const rawBal = await suiClient.getBalance({ owner: wallet.address, coinType: token.address });
              const formatted = (Number(rawBal.totalBalance) / Math.pow(10, token.decimals)).toFixed(4);
              return `${token.symbol}: ${formatted}`;
            } catch {
              return `${token.symbol}: 0.0000`;
            }
          })
        );
        push({ kind: 'separator' });
        balances.forEach((balLine) => push({ kind: 'output', text: `  ${balLine}` }));
        push({ kind: 'separator' });
      }
    } catch (e: any) {
      push({ kind: 'error', text: `failed: ${e.message}` });
    } finally { setBusy(false); }
    return true;
  }

  if (cmd.type === 'send') {
    if (!wallet) { push({ kind: 'error', text: 'no wallet — type `login` or `create`' }); return true; }

    const tokenSymbol = cmd.tokenSymbol || 'USDC';
    const token = SUI_STABLECOINS.find(
      (t) => t.symbol.toLowerCase() === tokenSymbol.toLowerCase()
    ) || (tokenSymbol.toUpperCase() === 'SUI' ? SUI_COIN : null);
    
    if (!token) {
      push({ kind: 'error', text: `token not supported: "${cmd.tokenSymbol}"` });
      return true;
    }

    try {
      const cleaned = cmd.to.trim().replace(/^@/, '');
      const freshContacts = await getContacts().catch(() => []);
      if (freshContacts.length > 0) {
        setContacts(freshContacts);
      }
      const contact = findContact(cleaned, freshContacts);
      const recipientAddress = contact
        ? contact.address
        : /^0x[0-9a-fA-F]{64}$/.test(cleaned)
        ? cleaned
        : null;
        
      if (!recipientAddress) {
        push({ kind: 'error', text: `unknown recipient: "${cmd.to}" — use a saved contact or full Sui address` });
        return true;
      }
      
      setStep({
        flow: 'confirm-send',
        pending: { 
          amount: cmd.amount, 
          to: cmd.to, 
          recipientAddress, 
          tokenSymbol: token.symbol,
          isPrivate: isPrivateMode
        },
      });
    } catch (e: any) {
      push({ kind: 'error', text: `failed to verify pin status: ${e.message || 'unauthorized'}` });
    }
    return true;
  }

  if (cmd.type === 'claim') {
    if (!wallet) { push({ kind: 'error', text: 'no wallet — type `login` or `create`' }); return true; }
    if (!cmd.salt) {
      push({ kind: 'info', text: 'enter the 64-character transaction salt:' });
      setStep({ flow: 'claim-private', step: 'salt', amount: cmd.amount });
      return true;
    }

    setBusy(true);
    push({ kind: 'info', text: `unshielding ${cmd.amount} USDC...` });
    try {
      const token = SUI_STABLECOINS[0]; // USDC by default
      const amountRaw = BigInt(Math.floor(cmd.amount * Math.pow(10, token.decimals)));

      // 1. Calculate commitment: sha256(amountRaw + salt)
      const encoder = new TextEncoder();
      const commitmentStr = `${amountRaw}:${cmd.salt}`;
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', encoder.encode(commitmentStr));
      const commitmentBytes = new Uint8Array(hashBuffer);

      // 2. Destination address bytes (Bob's address)
      const destAddrHex = wallet.address.replace('0x', '');
      const destBytes = new Uint8Array(destAddrHex.match(/.{1,2}/g)!.map((byte: string) => parseInt(byte, 16)));

      // 3. Message to sign = commitment bytes + destination address bytes
      const msg = new Uint8Array(commitmentBytes.length + destBytes.length);
      msg.set(commitmentBytes);
      msg.set(destBytes, commitmentBytes.length);

      // 4. Sign with user's keypair
      if (!wallet.keypair) {
        throw new Error('Wallet private signing key is missing in this session.');
      }
      const userSig = await wallet.keypair.signTransaction(msg);
      const pubKeyBytes = wallet.keypair.getPublicKey().toRawBytes();

      // 5. Construct withdraw Transaction Block
      const tx = new Transaction();
      tx.moveCall({
        target: `${KIBO_PACKAGE_ID}::shielded_pool::withdraw`,
        typeArguments: [token.address],
        arguments: [
          tx.object(SHIELDED_POOL_ID),
          tx.pure.vector('u8', Array.from(commitmentBytes)),
          tx.pure.vector('u8', Array.from(pubKeyBytes)),
          tx.pure.vector('u8', Array.from(atob(userSig.signature), c => c.charCodeAt(0))),
          tx.pure.address(wallet.address),
          tx.pure.u64(amountRaw),
        ],
      });

      push({ kind: 'info', text: 'submitting claim transaction (sponsored gaslessly)...' });
      const digest = await executeSponsoredTransaction(wallet, tx);

      push(
        { kind: 'success', text: `✓ Successfully unshielded and claimed ${cmd.amount} ${token.symbol}!` },
        { kind: 'output', text: `  transferred to your Kibo address: ${wallet.address}` },
        { kind: 'link', text: `  explorer ↗`, href: EXPLORER_TX(digest) }
      );
    } catch (e: any) {
      push({ kind: 'error', text: `claim failed: ${e.message}` });
    } finally {
      setBusy(false);
    }
    return true;
  }

  if (cmd.type === 'history') {
    if (!wallet) { push({ kind: 'error', text: 'no wallet — type `login` or `create`' }); return true; }
    push({
      kind: 'link',
      text: '  view on explorer ↗',
      href: `https://suiscan.xyz/testnet/account/${wallet.address}`,
    });
    return true;
  }

  if (cmd.type === 'unknown') {
    push({ kind: 'error', text: `command not found: "${cmd.raw}" — type \`help\`` });
    return true;
  }

  return false;
}
