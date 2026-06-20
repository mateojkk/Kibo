import { useState } from 'react';
import toast from 'react-hot-toast';
import { baseApi } from '../api';
import type { AgentWallet } from '../lib/wallet';
import { EXPLORER_ADDR } from '../lib/suiChain';
import settingsStyles from '../styles/settings.module.css';
import layoutStyles from '../styles/layout.module.css';
import surfaceStyles from '../styles/surface.module.css';
import formStyles from '../styles/forms.module.css';

interface SettingsViewProps {
  wallet: AgentWallet;
  onLock: () => void;
  onWalletChange: (wallet: AgentWallet | null) => void;
}

export default function SettingsView({ wallet, onLock, onWalletChange }: SettingsViewProps) {
  const [pinSection, setPinSection] = useState<'idle' | 'set' | 'done'>('idle');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const shortAddr = `${wallet.address.slice(0, 10)}…${wallet.address.slice(-8)}`;

  const handlePfpChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image size must be less than 2MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = reader.result as string;
      setBusy(true);
      try {
        await baseApi.put('/auth/profile', { pfp: base64Data });
        toast.success('Profile picture updated');
        onWalletChange({
          ...wallet,
          pfp: base64Data,
        });
      } catch (err: any) {
        toast.error(err.response?.data?.detail || 'Failed to update profile picture');
      } finally {
        setBusy(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const copyAddress = () => {
    navigator.clipboard.writeText(wallet.address);
    toast.success('Address copied');
  };

  const handleSetPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!/^\d{4,12}$/.test(pin)) { setError('PIN must be 4–12 digits'); return; }
    if (pin !== pinConfirm) { setError('PINs do not match'); return; }
    setBusy(true);
    try {
      await baseApi.post('/auth/pin', { pin });
      toast.success('Transaction PIN set');
      setPinSection('done');
      setPin('');
      setPinConfirm('');
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Failed to set PIN');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {/* Wallet info */}
      <div className={settingsStyles['settings-group']}>
        <div className={layoutStyles['section-title']} style={{ padding: '0 0 4px' }}>Wallet</div>

        <div className={settingsStyles['settings-item']} onClick={() => document.getElementById('pfp-input')?.click()}>
          <div className={settingsStyles['settings-item-label']}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
            Profile Picture
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {wallet.pfp ? (
              <img src={wallet.pfp} className={settingsStyles['settings-pfp-preview']} alt="" />
            ) : (
              <span className={settingsStyles['settings-pfp-fallback']}>None</span>
            )}
            <svg className={settingsStyles['settings-chevron']} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
          <input
            id="pfp-input"
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handlePfpChange}
          />
        </div>

        <div className={settingsStyles['settings-item']} onClick={copyAddress}>
          <div className={settingsStyles['settings-item-label']}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            Address
          </div>
          <span className={settingsStyles['settings-item-value']}>{shortAddr}</span>
        </div>

        <div className={settingsStyles['settings-item']} style={{ cursor: 'default' }}>
          <div className={settingsStyles['settings-item-label']}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 1 0-16 0"/></svg>
            Username
          </div>
          <span className={settingsStyles['settings-item-value']}>@{wallet.username}</span>
        </div>

        <a
          className={settingsStyles['settings-item']}
          href={EXPLORER_ADDR(wallet.address)}
          target="_blank"
          rel="noopener noreferrer"
          style={{ textDecoration: 'none' }}
        >
          <div className={settingsStyles['settings-item-label']}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            View on Explorer
          </div>
          <svg className={settingsStyles['settings-chevron']} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
        </a>
      </div>

      {/* Security */}
      <div className={settingsStyles['settings-group']}>
        <div className={layoutStyles['section-title']} style={{ padding: '0 0 4px' }}>Security</div>

        <div className={settingsStyles['settings-item']} onClick={() => { setPinSection(p => p === 'idle' ? 'set' : 'idle'); setError(''); }}>
          <div className={settingsStyles['settings-item-label']}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            Set Transaction PIN
          </div>
          <svg className={settingsStyles['settings-chevron']} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points={pinSection === 'set' ? '18 15 12 9 6 15' : '6 9 12 15 18 9'}/></svg>
        </div>

        {pinSection === 'set' && (
          <div className={surfaceStyles.card} style={{ borderRadius: 'var(--radius-sm)', margin: '4px 0' }}>
            <form onSubmit={handleSetPin}>
              <div className={formStyles.field}>
                <label>New PIN (4–12 digits)</label>
                <input type="password" inputMode="numeric" value={pin} onChange={e => setPin(e.target.value)} placeholder="••••" />
              </div>
              <div className={formStyles.field}>
                <label>Confirm PIN</label>
                <input type="password" inputMode="numeric" value={pinConfirm} onChange={e => setPinConfirm(e.target.value)} placeholder="••••" />
              </div>
              {error && <div className={formStyles['auth-error']}>{error}</div>}
              <button
                className={`${formStyles.btn} ${formStyles['btn-primary']}`}
                type="submit"
                disabled={busy}
                style={{ marginTop: 12 }}
              >
                {busy ? 'Saving…' : 'Set PIN'}
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Session */}
      <div className={settingsStyles['settings-group']}>
        <div className={layoutStyles['section-title']} style={{ padding: '0 0 4px' }}>Session</div>
        <div className={settingsStyles['settings-item']} onClick={onLock}>
          <div className={settingsStyles['settings-item-label']}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Log out
          </div>
        </div>
      </div>

      {/* Signature */}
      <div style={{
        textAlign: 'center',
        padding: '32px 0 16px',
        fontSize: '11px',
        color: 'var(--fg-muted)',
        fontFamily: 'var(--font-ui)',
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        opacity: 0.6,
      }}>
        by parity
      </div>
    </div>
  );
}
