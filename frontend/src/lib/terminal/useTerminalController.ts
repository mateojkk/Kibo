import { useCallback, useEffect, useRef, useState } from 'react';
import { BOOT_LINES } from './constants';
import { SUI_STABLECOINS, EXPLORER_TX } from '../suiChain';
import type { OutputLine } from '../../components/TerminalOutput';
import { parseCommand } from '../commandParser';
import { getContacts, findContact } from '../contacts';
import type { AgentWallet } from '../wallet';
import { baseApi } from '../../api';
import type { Step } from './types';
import { handleStepInput } from './stepFlow';
import { handleCommand } from './commandFlow';
import { Transaction } from '@mysten/sui/transactions';
import { suiClient } from '../wallet';

type UseTerminalOptions = {
  wallet?: AgentWallet | null;
  onWalletChange?: (wallet: AgentWallet | null) => void;
  onTransactionSuccess?: () => void;
};

export function useTerminalController(options: UseTerminalOptions = {}) {
  const { wallet: externalWallet, onWalletChange } = options;
  const [lines, setLines] = useState<OutputLine[]>(BOOT_LINES);
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [wallet, setWallet] = useState<AgentWallet | null>(externalWallet ?? null);
  const [contacts, setContacts] = useState<Awaited<ReturnType<typeof getContacts>>>([]);
  const [step, setStep] = useState<Step>(null);
  
  
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
    let fresh: any[] = [];
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
      const token = SUI_STABLECOINS.find(t => t.symbol.toLowerCase() === sym.toLowerCase());
      if (!token) {
        push({ kind: 'error', text: `token not supported: "${sym}"` });
        return false;
      }
      
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

        // Public Direct Gasless stablecoin transfer
        push({ kind: 'info', text: `preparing public transfer of ${amount} ${token.symbol} → @${recipient.label}...` });
        
        const tx = new Transaction();

        // 1. Get user's coins
        const coinsData = await suiClient.getCoins({ owner: wallet.address, coinType: token.address });
        if (coinsData.data.length === 0) throw new Error(`No ${token.symbol} coins found in wallet.`);
        
        const primaryCoin = tx.object(coinsData.data[0].coinObjectId);
        
        // 2. Merge remaining coins if multiple exist
        if (coinsData.data.length > 1) {
          tx.mergeCoins(primaryCoin, coinsData.data.slice(1).map((c: any) => tx.object(c.coinObjectId)));
        }
        
        // 3. Extract balance from coin (required for gasless stablecoin transfers)
        const balance = tx.moveCall({
          target: '0x2::coin::into_balance',
          typeArguments: [token.address],
          arguments: [primaryCoin],
        });
        
        // 4. Split the balance
        const splitBalance = tx.moveCall({
          target: '0x2::balance::split',
          typeArguments: [token.address],
          arguments: [balance, tx.pure.u64(amountRaw)],
        });

        // 5. Send via send_funds (this is the supported gasless method)
        tx.moveCall({
          target: '0x2::balance::send_funds',
          typeArguments: [token.address],
          arguments: [splitBalance, tx.pure.address(recipient.address)]
        });
        
        // 6. Return remaining balance to coin and send back to sender
        const remainingCoin = tx.moveCall({
          target: '0x2::coin::from_balance',
          typeArguments: [token.address],
          arguments: [balance]
        });
        tx.transferObjects([remainingCoin], tx.pure.address(wallet.address));
          tx.setGasPrice(0);
          tx.setGasBudget(0);
          tx.setGasPayment([]);

          push({ kind: 'info', text: `submitting public transaction...` });
          
          if (!wallet.keypair) throw new Error('Wallet missing keypair');
          tx.setSender(wallet.address);
          
          const result = await suiClient.signAndExecuteTransaction({
            signer: wallet.keypair,
            transaction: tx,
            options: { showEffects: true }
          });
          
          if (result.effects?.status?.status !== 'success') {
            throw new Error(`Transaction failed on-chain: ${result.effects?.status?.error || 'Unknown error'}`);
          }
          
          const digest = result.digest;

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
          if (options.onTransactionSuccess) {
            options.onTransactionSuccess();
          }
        return true;
      } catch (e: any) {
        push({ kind: 'error', text: `transfer failed: ${e.message}` });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [wallet, push]
  );

  const handleSubmit = useCallback(
    async (raw: string) => {
      if (!raw.trim()) return;

      if (step) {
        if (step.flow === 'confirm-send') {
          push({ kind: 'input', text: raw });
          const input = raw.toLowerCase().trim();
          if (input === 'y' || input === 'yes') {
            await confirmSendTransaction();
          } else if (input === 'n' || input === 'no') {
            cancelSendTransaction();
          } else {
            push({ kind: 'error', text: 'please type "y" to confirm or "n" to cancel.' });
          }
          return;
        }

        await handleStepInput({
          raw,
          step,
          setStep,
          setWallet,
          setBusy,
          push,
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
      });
    },
    [wallet, executeSend, push, step]
  );

  const confirmSendTransaction = useCallback(async () => {
    if (step?.flow !== 'confirm-send') return;
    const { amount, recipientAddress, tokenSymbol } = step.pending;
    
    setBusy(true);
    try {
      setStep(null);
      await executeSend(amount, recipientAddress, tokenSymbol);
    } catch (e: any) {
      const detail = e.response?.data?.detail;
      push({ kind: 'error', text: `Failed: ${detail || e.message}` });
      setStep(null);
    } finally {
      setBusy(false);
    }
  }, [step, executeSend, push]);

  const cancelSendTransaction = useCallback(() => {
    if (step?.flow !== 'confirm-send') return;
    setStep(null);
    push({ kind: 'error', text: 'transfer cancelled' });
  }, [step, push]);

  return {
    lines,
    cmdHistory,
    busy,
    wallet,
    contacts,
    step,
    handleSubmit,
    setWallet,
    confirmSendTransaction,
    cancelSendTransaction,
  };
}
