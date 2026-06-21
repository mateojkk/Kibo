import { useEffect, useState } from 'react';
import type { AgentWallet, AssetBalance } from '../hooks/useAppState';

import homeStyles from '../styles/home.module.css';

function TokenIcon({ symbol }: { symbol: string }) {
  if (symbol === 'USDC') {
    return <img src="https://cryptologos.cc/logos/usd-coin-usdc-logo.png" alt="USDC" className={homeStyles['asset-icon-fallback']} style={{ background: 'transparent', padding: '0', border: 'none' }} />;
  }
  
  if (symbol === 'USDsui') {
    return (
      <div className={homeStyles['asset-icon-fallback']} style={{ background: '#0b0a0a', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4c8cf5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
        </svg>
      </div>
    );
  }

  // Fallback for any other unexpected tokens
  return (
    <div 
      className={homeStyles['asset-icon-fallback']}
      style={{ background: 'linear-gradient(135deg, #4b5563, #9ca3af)', color: '#fff', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      {symbol.charAt(0)}
    </div>
  );
}

interface HomeViewProps {
  wallet: AgentWallet;
  balance: string | null;
  balanceLoading: boolean;
  assets: AssetBalance[];
  onRefresh: () => void;
}

export default function HomeView({
  balance,
  balanceLoading,
  assets,
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
        <div className={homeStyles['balance-label']}>Total Portfolio Value (Mock USD)</div>
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



      {/* Assets list */}
      <div className={homeStyles['asset-section']}>
        <div className={homeStyles['asset-title']}>Asset Accounts (Sui Testnet)</div>
        <div className={homeStyles['asset-list']}>
          {assets.filter(a => ['USDC', 'USDsui'].includes(a.symbol)).map((asset) => {
            return (
              <div key={asset.address} className={homeStyles['asset-card']}>
                <div className={homeStyles['asset-info']}>
                  <TokenIcon symbol={asset.symbol} />
                  <div className={homeStyles['asset-meta']}>
                    <span className={homeStyles['asset-symbol']}>{asset.symbol}</span>
                    <span className={homeStyles['asset-name']}>{asset.name}</span>
                  </div>
                </div>
                <div className={homeStyles['asset-balance-container']}>
                  <div className={homeStyles['asset-balance']}>
                    {balanceVisible ? asset.balance : '******'}
                  </div>
                  <div className={homeStyles['asset-value']}>
                    {balanceVisible 
                      ? `$${(parseFloat(asset.balance) * (asset.symbol === 'SUI' ? 1.25 : 1.0)).toFixed(2)}` 
                      : '******'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
