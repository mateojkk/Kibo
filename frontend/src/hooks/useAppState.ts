/**
 * useAppState — unified wallet/contact/balance state for Kibo
 */
import { useState, useEffect, useCallback } from 'react';
import { getContacts, addContact, removeContact } from '../lib/contacts';
import type { Contact } from '../lib/contacts';
import type { AgentWallet } from '../lib/wallet';
import { tryRestoreSession, suiClient } from '../lib/wallet';
import { ALL_SUPPORTED_COINS } from '../lib/suiChain';

export interface AssetBalance {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  balance: string;
  rawBalance: bigint;
}

export type { AgentWallet };

export function useAppState() {
  const [wallet, setWallet] = useState<AgentWallet | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [balance, setBalance] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [assets, setAssets] = useState<AssetBalance[]>([]);
  const [restoring, setRestoring] = useState(true); // true until we know if a session exists

  // On mount: silently restore session
  useEffect(() => {
    let cancelled = false;
    tryRestoreSession().then((restored) => {
      if (!cancelled) {
        if (restored) setWallet(restored);
        setRestoring(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  // Load contacts whenever wallet changes
  useEffect(() => {
    if (!wallet) { setContacts([]); return; }
    getContacts().then(setContacts).catch(() => setContacts([]));
  }, [wallet?.address]);

  const refreshBalance = useCallback(async () => {
    if (!wallet) return;
    setBalanceLoading(true);
    try {
      const results = await Promise.all(
        ALL_SUPPORTED_COINS.map(async (coin) => {
          try {
            const raw = await suiClient.getBalance({
              owner: wallet.address,
              coinType: coin.address,
            });
            const balanceVal = BigInt(raw.totalBalance);
            const formatted = (Number(balanceVal) / Math.pow(10, coin.decimals)).toFixed(4);
            return {
              ...coin,
              balance: formatted,
              rawBalance: balanceVal,
            };
          } catch (e) {
            console.error(`Error fetching balance for ${coin.symbol}:`, e);
            return {
              ...coin,
              balance: '0.0000',
              rawBalance: 0n,
            };
          }
        })
      );
      setAssets(results);
      
      // Calculate a total (sum of stablecoins, excluding SUI since users can't send/receive it)
      const total = results.reduce((acc, item) => {
        if (item.symbol === 'SUI') return acc;
        const val = parseFloat(item.balance);
        return acc + val;
      }, 0);
      setBalance(total.toFixed(2));
    } catch (e) {
      console.error('Error refreshing balances:', e);
      setBalance('—');
    } finally {
      setBalanceLoading(false);
    }
  }, [wallet]);

  // Auto-fetch balance when wallet connects
  useEffect(() => {
    refreshBalance();
  }, [refreshBalance]);

  const refreshContacts = useCallback(async () => {
    const c = await getContacts();
    setContacts(c);
    return c;
  }, []);

  const addContactFn = useCallback(async (name: string, address: string) => {
    await addContact(name, address);
    await refreshContacts();
  }, [refreshContacts]);

  const removeContactFn = useCallback(async (name: string) => {
    await removeContact(name);
    await refreshContacts();
  }, [refreshContacts]);

  return {
    wallet,
    setWallet,
    restoring,
    contacts,
    balance,
    balanceLoading,
    assets,
    refreshBalance,
    refreshContacts,
    addContact: addContactFn,
    removeContact: removeContactFn,
  };
}
