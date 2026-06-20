import { useCallback, useEffect, useRef, useState } from 'react';
import { BOOT_LINES } from './constants';
import { SUI_STABLECOINS, SUI_COIN, KIBO_PACKAGE_ID, SHIELDED_POOL_ID, EXPLORER_TX } from '../suiChain';
import type { OutputLine } from '../../components/TerminalOutput';
import { parseCommand } from '../commandParser';
import { getContacts, findContact } from '../contacts';
import type { AgentWallet } from '../wallet';
import { baseApi } from '../../api';
import type { Step } from './types';
import { handleStepInput } from './stepFlow';
import { handleCommand } from './commandFlow';
import { Transaction } from '@mysten/sui/transactions';
import { suiClient, executeSponsoredTransaction } from '../wallet';
import { encryptMetadata } from '../crypto';

type UseTerminalOptions = {
  wallet?: AgentWallet | null;
  onWalletChange?: (wallet: AgentWallet | null) => void;
};

export function useTerminalController(options: UseTerminalOptions = {}) {
  const { wallet: externalWallet, onWalletChange } = options;
  const [lines, setLines] = useState<OutputLine[]>(BOOT_LINES);
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [wallet, setWallet] = useState<AgentWallet | null>(externalWallet ?? null);
  const [contacts, setContacts] = useState<Awaited<ReturnType<typeof getContacts>>>([]);
  const [step, setStep] = useState<Step>(null);
  
  // Private-by-default toggle
  const [isPrivateMode, setIsPrivateMode] = useState<boolean>(true);
  
  const syncingRef = useRef(false);

  useEffect(() => {
    if (externalWallet?.address !== wallet?.address) {
      syncingRef.current = true;
      setWallet(externalWallet ?? null);
    }
  }, [externalWallet?.address]);

  useEffect(() => {
    if (!onWalletChange) return;
    if (syncingRef.current) {
      syncingRef.current = false;
      return;
    }
    if (wallet?.address !== externalWallet?.address) {
      onWalletChange(wallet ?? null);
    }
  }, [wallet?.address, wallet?.username, onWalletChange]);

  useEffect(() => {
    const saved = sessionStorage.getItem('kibo_lines');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setLines(parsed);
      } catch {
        /* ignore */
      }
    }
  }, []);

  useEffect(() => {
    if (lines.length > BOOT_LINES.length) {
      sessionStorage.setItem('kibo_lines', JSON.stringify(lines.slice(-100)));
    }
  }, [lines]);

  useEffect(() => {
    if (!wallet?.address) return;
    getContacts()
      .then(setContacts)
      .catch(() => setContacts([]));
  }, [wallet?.address]);

  const push = useCallback((...newLines: OutputLine[]) => {
    setLines((prev) => [...prev, ...newLines]);
  }, []);

  const resolveRecipient = async (to: string) => {
    const cleaned = to.trim().replace(/^@/, '');
    let fresh = [];
    try {
      fresh = await getContacts();
      setContacts(fresh);
    } catch {
      fresh = [];
    }
    const contact = findContact(cleaned, fresh);
    if (contact) {
      return { address: contact.address, label: contact.name };
    }
    // Sui address validation: starts with 0x and is 66 chars (64 hex characters)
    if (/^0x[0-9a-fA-F]{64}$/.test(cleaned)) {
      const shortAddr = `${cleaned.slice(0, 6)}...${cleaned.slice(-4)}`;
      return { address: cleaned, label: shortAddr };
    }
    return null;
  };

  const executeSend = useCallback(
    async (amount: number, to: string, tokenSymbol?: string) => {
      if (!wallet) {
        push({ kind: 'error', text: 'no wallet — please sign in first' });
        return false;
      }
      
      const recipient = await resolveRecipient(to);
      if (!recipient) {
        push({ kind: 'error', text: `unknown recipient: "${to}" — not in contacts and not a valid Sui address` });
        return false;
      }

      const sym = tokenSymbol || 'USDC';
      const token = SUI_STABLECOINS.find(t => t.symbol.toLowerCase() === sym.toLowerCase()) || SUI_COIN;
      
      const amountRaw = BigInt(Math.floor(amount * Math.pow(10, token.decimals)));
      
      setBusy(true);
      try {
        // 1. Fetch user's balance to check funds
        const balResp = await suiClient.getBalance({ owner: wallet.address, coinType: token.address });
        const userBal = BigInt(balResp.totalBalance);
        
        if (userBal < amountRaw) {
          push({ kind: 'error', text: `insufficient funds — need ${amount} ${token.symbol} (have ${(Number(userBal) / Math.pow(10, token.decimals)).toFixed(4)})` });
          return false;
        }

        if (isPrivateMode) {
          push({ kind: 'info', text: `encrypting payment payload for @${recipient.label}...` });
          
          // A. Fetch recipient's encryption public key from directory
          let recipientPubkeyStr = '';
          try {
            const pubkeyResp = await baseApi.get(`/users/${recipient.address}/pubkey`);
            recipientPubkeyStr = pubkeyResp.data?.publicKey || '';
          } catch (e) {
            // Try fetching by username/label if address fails
            try {
              const pubkeyResp = await baseApi.get(`/users/${recipient.label}/pubkey`);
              recipientPubkeyStr = pubkeyResp.data?.publicKey || '';
            } catch {
              recipientPubkeyStr = '';
            }
          }

          if (!recipientPubkeyStr) {
            push({ 
              kind: 'error', 
              text: `recipient @${recipient.label} does not have a registered Kibo encryption key. Private transfers cannot be completed. Please toggle Private Mode OFF to send publicly.` 
            });
            return false;
          }

          // B. Generate random 256-bit salt for commitment
          const salt = Array.from(window.crypto.getRandomValues(new Uint8Array(32)))
            .map(b => b.toString(16).padStart(2, '0')).join('');

          // C. Calculate sha256 commitment hash
          const encoder = new TextEncoder();
          const commitmentStr = `${amountRaw}:${salt}`;
          const hashBuffer = await window.crypto.subtle.digest('SHA-256', encoder.encode(commitmentStr));
          const commitmentBytes = new Uint8Array(hashBuffer);
          
          // D. Encrypt metadata
          const encryptedPayload = await encryptMetadata(recipientPubkeyStr, {
            amount: amountRaw.toString(),
            salt: salt,
            sender: wallet.username,
            tokenSymbol: token.symbol,
            coinType: token.address,
          });
          const encryptedMetadataBytes = encoder.encode(JSON.stringify(encryptedPayload));

          // E. Construct transaction block for ShieldedPool deposit
          const tx = new Transaction();
          
          // Get user's coin objects of coinType
          const coinsData = await suiClient.getCoins({ owner: wallet.address, coinType: token.address });
          if (coinsData.data.length === 0) {
            throw new Error(`No ${token.symbol} coin objects found in wallet.`);
          }

          let primaryCoinInput;
          if (token.address === '0x2::sui::SUI') {
            // SUI can be split directly from gas
            const [splitCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(amountRaw)]);
            primaryCoinInput = splitCoin;
          } else {
            const firstCoin = coinsData.data[0].coinObjectId;
            const primaryCoin = tx.object(firstCoin);
            
            // Merge remaining coin objects if multiple exist
            if (coinsData.data.length > 1) {
              tx.mergeCoins(primaryCoin, coinsData.data.slice(1).map(c => tx.object(c.coinObjectId)));
            }
            const [splitCoin] = tx.splitCoins(primaryCoin, [tx.pure.u64(amountRaw)]);
            primaryCoinInput = splitCoin;
          }

          // Call deposit
          tx.moveCall({
            target: `${KIBO_PACKAGE_ID}::shielded_pool::deposit`,
            typeArguments: [token.address],
            arguments: [
              tx.object(SHIELDED_POOL_ID),
              primaryCoinInput,
              tx.pure.vector('u8', Array.from(commitmentBytes)),
              tx.pure.vector('u8', Array.from(encryptedMetadataBytes)),
            ],
          });

          push({ kind: 'info', text: `submitting shielded deposit transaction (gasless)...` });
          
          // Sign and execute via sponsor relayer
          const digest = await executeSponsoredTransaction(wallet, tx);

          // Record activity in local database
          await baseApi.post('/activity', {
            txHash: digest,
            amount: amount,
            to: recipient.address,
            label: `@${recipient.label} (Private)`,
          });

          push(
            { kind: 'success', text: `✓ Private transfer sent to @${recipient.label}!` },
            { kind: 'output', text: `  salt: ${salt}` },
            { kind: 'output', text: `  (recipient can scan onchain events and claim gaslessly)` },
            { kind: 'link', text: `  explorer ↗`, href: EXPLORER_TX(digest) }
          );
        } else {
          // Public Direct Gasless stablecoin transfer
          push({ kind: 'info', text: `preparing public transfer of ${amount} ${token.symbol} → @${recipient.label}...` });
          
          const tx = new Transaction();
          const coinsData = await suiClient.getCoins({ owner: wallet.address, coinType: token.address });
          if (coinsData.data.length === 0) {
            throw new Error(`No ${token.symbol} coin objects found in wallet.`);
          }

          let splitCoin;
          if (token.address === '0x2::sui::SUI') {
            const [sCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(amountRaw)]);
            splitCoin = sCoin;
          } else {
            const primaryCoin = tx.object(coinsData.data[0].coinObjectId);
            if (coinsData.data.length > 1) {
              tx.mergeCoins(primaryCoin, coinsData.data.slice(1).map(c => tx.object(c.coinObjectId)));
            }
            const [sCoin] = tx.splitCoins(primaryCoin, [tx.pure.u64(amountRaw)]);
            splitCoin = sCoin;
          }

          tx.transferObjects([splitCoin], recipient.address);

          push({ kind: 'info', text: `submitting public transaction (gasless Relayer)...` });
          const digest = await executeSponsoredTransaction(wallet, tx);

          await baseApi.post('/activity', {
            txHash: digest,
            amount: amount,
            to: recipient.address,
            label: `@${recipient.label} (Public)`,
          });

          push(
            { kind: 'success', text: `✓ Public transfer of ${amount} ${token.symbol} successful!` },
            { kind: 'link', text: `  explorer ↗`, href: EXPLORER_TX(digest) }
          );
        }
        return true;
      } catch (e: any) {
        push({ kind: 'error', text: `transfer failed: ${e.message}` });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [wallet, push, isPrivateMode]
  );

  const handleSubmit = useCallback(
    async (raw: string) => {
      if (!raw.trim()) return;

      if (step) {
        await handleStepInput({
          raw,
          step,
          setStep,
          setWallet,
          setBusy,
          push,
          executeSend,
        });
        return;
      }

      push({ kind: 'input', text: raw });
      setCmdHistory((h) => [raw, ...h].slice(0, 50));

      const cmd = parseCommand(raw);

      await handleCommand({
        cmd,
        wallet,
        setWallet,
        setStep,
        setContacts,
        setBusy,
        setLines,
        bootLines: BOOT_LINES,
        push,
        executeSend,
      });
    },
    [wallet, executeSend, push, step]
  );

  return {
    lines,
    cmdHistory,
    busy,
    wallet,
    contacts,
    step,
    isPrivateMode,
    setIsPrivateMode,
    handleSubmit,
    setWallet,
  };
}
