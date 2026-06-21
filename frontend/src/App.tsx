import { Toaster } from 'react-hot-toast';
import { useAppState } from './hooks/useAppState';
import AuthView from './views/AuthView';
import AppShell from './components/AppShell';
import type { AgentWallet } from './lib/wallet';
import { destroyWallet } from './lib/wallet';
import { useAutoClaim } from './hooks/useAutoClaim';

export default function App() {
  const {
    wallet,
    setWallet,
    restoring,
    contacts,
    balance,
    balanceLoading,
    assets,
    refreshBalance,
    addContact,
    removeContact,
  } = useAppState();

  // Run the background Zero-Knowledge Proof unshielding process
  useAutoClaim(wallet, refreshBalance);

  const handleWallet = (w: AgentWallet) => {
    setWallet(w);
  };

  const handleLogout = async () => {
    await destroyWallet();
    setWallet(null);
  };

  return (
    <>
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: 'var(--bg-card)',
            color: 'var(--fg)',
            border: '1px solid var(--border-hl)',
            fontSize: '13px',
            fontFamily: 'var(--font-ui)',
          },
          success: { iconTheme: { primary: 'var(--accent)', secondary: '#000' } },
          error: { iconTheme: { primary: 'var(--red)', secondary: '#fff' } },
        }}
      />

      {restoring ? (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100dvh',
          background: 'var(--bg)',
          color: 'var(--fg-muted)',
          fontSize: '13px',
          fontFamily: 'var(--font-ui)',
          gap: '10px',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          Kibo
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : wallet ? (
        <AppShell
          wallet={wallet}
          contacts={contacts}
          balance={balance}
          balanceLoading={balanceLoading}
          assets={assets}
          onRefreshBalance={refreshBalance}
          onAddContact={addContact}
          onRemoveContact={removeContact}
          onLock={handleLogout}
          onWalletChange={setWallet}
        />
      ) : (
        <AuthView onWallet={handleWallet} onLogout={handleLogout} />
      )}
    </>
  );
}
