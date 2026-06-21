import { useEffect, useState } from 'react';
import type { AgentWallet, AssetBalance } from '../hooks/useAppState';

import homeStyles from '../styles/home.module.css';
import TransactionsView from './TransactionsView';



interface HomeViewProps {
  wallet: AgentWallet;
  balance: string | null;
  balanceLoading: boolean;
  assets: AssetBalance[];
  onRefresh: () => void;
}

export default function HomeView({
  wallet,
  balance,
  balanceLoading,
  onRefresh,
}: HomeViewProps) {
  const BALANCE_VISIBILITY_KEY = 'kibo_balance_visible';
  const [balanceVisible, setBalanceVisible] = useState<boolean>(() => {
    const saved = sessionStorage.getItem(BALANCE_VISIBILITY_KEY);
    return saved !== '0';
  });

  const handleRefresh = () => {
    onRefresh();
  };

  useEffect(() => {
    sessionStorage.setItem(BALANCE_VISIBILITY_KEY, balanceVisible ? '1' : '0');
  }, [balanceVisible]);

  return (
    <div className={homeStyles['home-container']}>
      {/* Balance card */}
      <div className={homeStyles['balance-card']}>
        <div className={homeStyles['balance-label']}>Total Portfolio Value</div>
        <div className={homeStyles['balance-amount']}>
          {balanceLoading ? (
            <span style={{ color: 'var(--fg-muted)', fontSize: 28 }}>Loading…</span>
          ) : (
            <>
              <span className={homeStyles['balance-currency']}>$</span>
              {balanceVisible ? (balance ?? '—') : '******'}
            </>
          )}
        </div>
        <div className={homeStyles['balance-actions']}>
          <button
            className={homeStyles['balance-refresh']}
            onClick={() => setBalanceVisible(v => !v)}
            title={balanceVisible ? 'Hide balance' : 'Show balance'}
            aria-label={balanceVisible ? 'Hide balance' : 'Show balance'}
          >
            {balanceVisible ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20C5 20 1 12 1 12a21.86 21.86 0 0 1 5.06-6.94"/>
                <path d="M9.9 4.24A10.98 10.98 0 0 1 12 4c7 0 11 8 11 8a21.82 21.82 0 0 1-3.17 4.5"/>
                <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            )}
          </button>
          <button
            className={homeStyles['balance-refresh']}
            onClick={handleRefresh}
            title="Refresh balance"
          >
            <svg
              width="16" height="16"
              viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round"
              className={balanceLoading ? homeStyles.spinning : ''}
            >
              <path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
            </svg>
          </button>
        </div>
      </div>



      <TransactionsView wallet={wallet} />
    </div>
  );
}
