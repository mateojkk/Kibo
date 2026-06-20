import { useEffect, useState } from 'react';
import type { AgentWallet, AssetBalance } from '../hooks/useAppState';
import { baseApi } from '../api';
import { performSwap } from '../lib/cetus';
import toast from 'react-hot-toast';
import homeStyles from '../styles/home.module.css';

function TokenIcon({ symbol }: { symbol: string }) {
  // Return a beautiful, HSL-colored fallback icon for each token
  const colors: Record<string, string> = {
    SUI: 'linear-gradient(135deg, #0284c7, #38bdf8)',
    USDC: 'linear-gradient(135deg, #2563eb, #3b82f6)',
    FDUSD: 'linear-gradient(135deg, #059669, #34d399)',
    AUSD: 'linear-gradient(135deg, #dc2626, #f87171)',
    USDY: 'linear-gradient(135deg, #d97706, #fbbf24)',
    USDsui: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
  };

  const background = colors[symbol] || 'linear-gradient(135deg, #4b5563, #9ca3af)';

  return (
    <div 
      className={homeStyles['asset-icon-fallback']}
      style={{ background, color: '#fff', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
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
  onNavigateToTab?: (tab: 'home' | 'contacts' | 'chat' | 'settings' | 'transactions') => void;
}

export default function HomeView({
  wallet,
  balance,
  balanceLoading,
  assets,
  onRefresh,
  onNavigateToTab,
}: HomeViewProps) {
  const BALANCE_VISIBILITY_KEY = 'kibo_balance_visible';
  const [faucetLoading, setFaucetLoading] = useState(false);
  const [swapLoading, setSwapLoading] = useState(false);
  const [balanceVisible, setBalanceVisible] = useState<boolean>(() => {
    const saved = sessionStorage.getItem(BALANCE_VISIBILITY_KEY);
    return saved !== '0';
  });

  const handleRefresh = () => {
    onRefresh();
  };

  const handleRequestFaucet = async () => {
    if (faucetLoading) return;
    setFaucetLoading(true);
    const loadingToast = toast.loading('Requesting SUI from Testnet Faucet...');
    
    try {
      const resp = await baseApi.post('/faucet');
      if (resp.data?.ok) {
        toast.success('SUI successfully requested! Balances will update shortly.', { id: loadingToast });
        setTimeout(() => {
          handleRefresh();
        }, 3000);
      } else {
        toast.error(`Faucet request throttled or failed. Please try again later.`, { id: loadingToast });
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e.response?.data?.detail || 'Faucet request failed.', { id: loadingToast });
    } finally {
      setFaucetLoading(false);
    }
  };

  const handleSwap = async () => {
    if (swapLoading) return;
    setSwapLoading(true);
    const loadingToast = toast.loading('Swapping 1 SUI for USDC...');
    try {
      await performSwap(wallet, 1);
      toast.success('Swap complete! Balances updated.', { id: loadingToast });
      onRefresh();
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || 'Swap failed.', { id: loadingToast, duration: 6000 });
    } finally {
      setSwapLoading(false);
    }
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

      {/* Quick actions */}
      <div className={homeStyles['action-row']}>
        <button
          className={`${homeStyles['action-btn']} ${homeStyles.primary}`}
          onClick={() => onNavigateToTab?.('chat')}
        >
          <svg viewBox="0 0 24 24">
            <polyline points="4 17 10 11 4 5"/>
            <line x1="12" y1="19" x2="20" y2="19"/>
          </svg>
          Chat Command Line
        </button>
        <button
          className={`${homeStyles['action-btn']} ${homeStyles.primary}`}
          onClick={handleRequestFaucet}
          disabled={faucetLoading || swapLoading}
        >
          <svg viewBox="0 0 24 24"><path d="M12 2v14m-7-7 7 7 7-7"/><path d="M5 21h14"/></svg>
          {faucetLoading ? 'Requesting...' : 'Request Faucet Tokens'}
        </button>
        <button
          className={`${homeStyles['action-btn']}`}
          onClick={handleSwap}
          disabled={swapLoading || faucetLoading}
        >
          <svg viewBox="0 0 24 24"><path d="M4 12h16M4 12l4-4m-4 4 4 4"/></svg>
          {swapLoading ? 'Swapping...' : 'Swap 1 SUI for USDC'}
        </button>
      </div>

      {/* Assets list */}
      <div className={homeStyles['asset-section']}>
        <div className={homeStyles['asset-title']}>Asset Accounts (Sui Testnet)</div>
        <div className={homeStyles['asset-list']}>
          {assets.map((asset) => {
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
