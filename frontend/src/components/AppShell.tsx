import { useEffect, useState } from 'react';
import type { AgentWallet } from '../lib/wallet';
import type { Contact } from '../lib/contacts';
import type { AssetBalance } from '../hooks/useAppState';
import HomeView from '../views/HomeView';
import ContactsView from '../views/ContactsView';
import SettingsView from '../views/SettingsView';
import TransactionsView from '../views/TransactionsView';
import Terminal from './Terminal';
import styles from '../styles/appShell.module.css';

type Tab = 'home' | 'contacts' | 'chat' | 'settings' | 'transactions';
const ACTIVE_TAB_KEY = 'kibo_active_tab';

interface AppShellProps {
  wallet: AgentWallet;
  contacts: Contact[];
  balance: string | null;
  balanceLoading: boolean;
  assets: AssetBalance[];
  onRefreshBalance: () => void;
  onAddContact: (name: string, address: string) => Promise<void>;
  onRemoveContact: (name: string) => Promise<void>;
  onLock: () => void;
  onWalletChange: (wallet: AgentWallet | null) => void;
}

export default function AppShell({
  wallet,
  contacts,
  balance,
  balanceLoading,
  assets,
  onRefreshBalance,
  onAddContact,
  onRemoveContact,
  onLock,
  onWalletChange,
}: AppShellProps) {
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const saved = sessionStorage.getItem(ACTIVE_TAB_KEY);
    return isTab(saved) ? saved : 'home';
  });
  const shortAddr = `${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}`;

  useEffect(() => {
    sessionStorage.setItem(ACTIVE_TAB_KEY, activeTab);
  }, [activeTab]);

  return (
    <div className={styles['app-shell']}>
      {/* Header */}
      <header className={styles['app-header']}>
        <div className={styles['app-logo']}>
          <img src="/favicon.png" alt="kibo" className={styles['app-logo-img']} />
        </div>
        <div
          className={styles['app-user-badge']}
          onClick={() => setActiveTab('settings')}
        >
          {wallet.pfp ? (
            <>
              <img src={wallet.pfp} className={styles['user-pfp']} alt="" />
              @{wallet.username}
            </>
          ) : (
            <>
              <span className={styles['user-dot']} />
              @{wallet.username} · {shortAddr}
            </>
          )}
        </div>
      </header>

      {/* Content */}
      <main className={styles['app-content']}>
        {activeTab === 'home' && (
          <HomeView
            wallet={wallet}
            balance={balance}
            balanceLoading={balanceLoading}
            assets={assets}
            onRefresh={onRefreshBalance}
            onNavigateToTab={(tab) => setActiveTab(tab)}
          />
        )}
        {activeTab === 'transactions' && (
          <TransactionsView wallet={wallet} />
        )}
        {activeTab === 'contacts' && (
          <ContactsView
            contacts={contacts}
            onAdd={onAddContact}
            onRemove={onRemoveContact}
          />
        )}
        {activeTab === 'chat' && (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Terminal wallet={wallet} onWalletChange={onWalletChange} />
          </div>
        )}
        {activeTab === 'settings' && (
          <SettingsView wallet={wallet} onLock={onLock} onWalletChange={onWalletChange} />
        )}
      </main>

      {/* Tab bar */}
      <nav className={styles['tab-bar']}>
        <TabItem
          id="home"
          label="Home"
          active={activeTab === 'home'}
          onClick={() => setActiveTab('home')}
          icon={
            <svg className={styles['tab-icon']} viewBox="0 0 24 24">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
          }
        />
        <TabItem
          id="transactions"
          label="History"
          active={activeTab === 'transactions'}
          onClick={() => setActiveTab('transactions')}
          icon={
            <svg className={styles['tab-icon']} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          }
        />
        <TabItem
          id="contacts"
          label="Contacts"
          active={activeTab === 'contacts'}
          onClick={() => setActiveTab('contacts')}
          icon={
            <svg className={styles['tab-icon']} viewBox="0 0 24 24">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          }
        />
      </nav>
    </div>
  );
}

// ─── helpers ─────────────────────────────────────
function isTab(value: string | null): value is Tab {
  return value === 'home' || value === 'contacts' || value === 'chat' || value === 'settings' || value === 'transactions';
}

function TabItem({
  id,
  label,
  icon,
  active,
  onClick,
}: {
  id: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      id={`tab-${id}`}
      className={
        active
          ? `${styles['tab-item']} ${styles.active}`
          : styles['tab-item']
      }
      onClick={onClick}
      aria-label={label}
    >
      {icon}
      {label}
    </button>
  );
}
