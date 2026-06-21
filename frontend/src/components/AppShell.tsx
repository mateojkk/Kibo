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
    return isTab(saved) ? saved : 'chat';
  });
  const shortAddr = `${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}`;

  const [isCollapsed, setIsCollapsed] = useState(true);

  const handleRequestFaucet = () => {
    window.open('https://faucet.circle.com/', '_blank');
  };

  useEffect(() => {
    sessionStorage.setItem(ACTIVE_TAB_KEY, activeTab);
  }, [activeTab]);

  return (
    <div className={`${styles['app-shell']} ${isCollapsed ? styles.collapsed : ''}`}>
      {/* Header */}
      <header className={styles['app-header']}>
        <div 
          className={styles['app-logo']} 
          style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
          onClick={() => setIsCollapsed(!isCollapsed)}
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          <img src="/logo.png" alt="Kibo Logo" className={styles['app-logo-img']} />
          <span className={styles['logo-text']}>Kibo</span>
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
      <main className={`${styles['app-content']} ${activeTab === 'chat' ? styles['no-padding'] : ''}`}>
        {activeTab === 'home' && (
          <HomeView
            wallet={wallet}
            balance={balance}
            balanceLoading={balanceLoading}
            assets={assets}
            onRefresh={onRefreshBalance}
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
          id="chat"
          label="Chat"
          active={activeTab === 'chat'}
          onClick={() => setActiveTab('chat')}
          icon={
            <svg className={styles['tab-icon']} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          }
        />
        <TabItem
          id="home"
          label="Portfolio"
          active={activeTab === 'home'}
          onClick={() => setActiveTab('home')}
          icon={
            <svg className={styles['tab-icon']} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
              <line x1="7" y1="7" x2="7.01" y2="7"/>
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
          label="Address Book"
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
        <TabItem
          id="faucet"
          label="Faucet"
          active={false}
          onClick={handleRequestFaucet}
          icon={
            <svg className={styles['tab-icon']} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v14m-7-7 7 7 7-7"/><path d="M5 21h14"/>
            </svg>
          }
        />
        <div style={{ flexGrow: 1 }} />
        <TabItem
          id="settings"
          label="Settings"
          active={activeTab === 'settings'}
          onClick={() => setActiveTab('settings')}
          icon={
            <svg className={styles['tab-icon']} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
              <circle cx="12" cy="12" r="3"/>
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

function TabItem({ label, active, onClick, icon }: any) {
  return (
    <button
      className={`${styles['tab-item']} ${active ? styles.active : ''}`}
      onClick={onClick}
    >
      {icon}
      <span className={styles['tab-label']}>{label}</span>
    </button>
  );
}
