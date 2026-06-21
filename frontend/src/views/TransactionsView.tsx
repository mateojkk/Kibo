import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentWallet } from '../lib/wallet';
import { EXPLORER_TX } from '../lib/suiChain';
import { fetchActivity, loadCachedActivity, type ActivityItem } from '../lib/activity';
import homeStyles from '../styles/home.module.css';
import layoutStyles from '../styles/layout.module.css';

interface TransactionsViewProps {
  wallet: AgentWallet;
}

function formatTxLabel(label: string, from?: string, to?: string, direction?: 'in' | 'out') {
  if (!label.startsWith('0x')) {
    return label;
  }
  const address = direction === 'in' ? from : to;
  const fullAddr = address && address.startsWith('0x') && address.length === 66 ? address : label;
  if (fullAddr.length === 66) {
    return `${fullAddr.slice(0, 6)}…${fullAddr.slice(-4)}`;
  }
  const clean = fullAddr.replace('...', '…');
  const parts = clean.slice(2).split('…');
  if (parts.length === 2) {
    return `0x${parts[0].slice(0, 4)}…${parts[1].slice(-4)}`;
  }
  return label;
}

export default function TransactionsView({ wallet }: TransactionsViewProps) {
  const [activity, setActivity] = useState<ActivityItem[]>(() => loadCachedActivity(wallet.address));
  const activityRequestRef = useRef(0);
  const activityRef = useRef<ActivityItem[]>(loadCachedActivity(wallet.address));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const cached = loadCachedActivity(wallet.address);
    activityRef.current = cached;
    setActivity(cached);
  }, [wallet.address]);

  useEffect(() => {
    activityRef.current = activity;
  }, [activity]);

  const refreshActivity = useCallback(async () => {
    const requestId = ++activityRequestRef.current;
    setLoading(true);
    try {
      const items = await fetchActivity(wallet);
      if (requestId === activityRequestRef.current) {
        if (items.length > 0 || activityRef.current.length === 0) {
          setActivity(items);
        }
      }
    } finally {
      if (requestId === activityRequestRef.current) {
        setLoading(false);
      }
    }
  }, [wallet]);

  useEffect(() => {
    refreshActivity();
    window.addEventListener('kibo-activity', refreshActivity as EventListener);
    const intervalId = window.setInterval(refreshActivity, 30000);
    return () => {
      window.removeEventListener('kibo-activity', refreshActivity as EventListener);
      window.clearInterval(intervalId);
    };
  }, [refreshActivity]);

  return (
    <div className={layoutStyles.section} style={{ padding: '16px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div className={layoutStyles['section-title']} style={{ margin: 0 }}>Transactions</div>
        <button
          className={homeStyles['balance-refresh']}
          onClick={refreshActivity}
          title="Refresh transactions"
          disabled={loading}
        >
          <svg
            width="16" height="16"
            viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"
            className={loading ? homeStyles.spinning : ''}
          >
            <path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
          </svg>
        </button>
      </div>

      {activity.length === 0 ? (
        <div className={homeStyles['activity-empty']}>No transactions yet.</div>
      ) : (
        <div className={homeStyles['activity-list']}>
          {activity.map((item) => (
            <a 
              className={homeStyles['activity-item']} 
              key={item.id}
              href={EXPLORER_TX(item.txHash)}
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: 'none', color: 'inherit', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <div>
                <div className={homeStyles['activity-amount']}>{item.amount} USDC</div>
                <div className={homeStyles['activity-meta']}>
                  {item.direction === 'in' ? 'from' : 'to'} {formatTxLabel(item.label, item.from, item.to, item.direction)} · {new Date(item.createdAt).toLocaleString()}
                </div>
              </div>
              <div className={homeStyles['activity-link']}>
                View ↗
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
