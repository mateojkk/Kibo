import React, { useState, useEffect } from 'react';
import type { AgentWallet } from '../lib/wallet';
import { loginWithGoogle } from '../lib/wallet';
import { renderGoogleButton } from '../lib/googleAuth';
import authStyles from '../styles/auth.module.css';
import formStyles from '../styles/forms.module.css';

interface AuthViewProps {
  onWallet: (w: AgentWallet) => void;
  onLogout: () => Promise<void> | void;
}

type AuthStep = 'signin' | 'username' | 'connecting';

export default function AuthView({ onWallet }: AuthViewProps) {
  const [step, setStep] = useState<AuthStep>('signin');
  const [username, setUsername] = useState('');
  const [pendingCredential, setPendingCredential] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (msg: string) => {
    setLogs((prev) => [...prev, `> ${msg}`]);
  };

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || 'kibo-client-id';
    const btn = document.getElementById('google-signin-btn');
    if (btn) {
      renderGoogleButton(btn, clientId, handleGoogleCredential);
    }
  }, []);

  const handleGoogleCredential = async (credential: string) => {
    setError('');
    setBusy(true);
    setLogs([]);
    setStep('connecting');
    addLog('Google verified — setting up your wallet...');

    try {
      // Try login first. If backend returns "invite code required" (new user),
      // prompt for username + invite code.
      try {
        addLog('Securing your account...');
        const wallet = await loginWithGoogle(credential);
        addLog('Secure session established...');
        onWallet(wallet);
      } catch (err: any) {
        const detail = err?.response?.data?.detail;
        if (detail === 'invite code required' || (err?.response?.status === 400 && String(detail).includes('invite'))) {
          addLog('New account detected. Registration required...');
          setPendingCredential(credential);
          setStep('username');
        } else {
          throw err;
        }
      }
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err.message || 'Authentication failed.';
      setError(msg);
      setStep('signin');
    } finally {
      setBusy(false);
    }
  };



  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const cleanUsername = username.trim().toLowerCase();
    if (cleanUsername.length < 3) {
      setError('Username must be at least 3 characters.');
      return;
    }
    if (!/^[a-z0-9_]+$/.test(cleanUsername)) {
      setError('Username can only contain letters, numbers, and underscores.');
      return;
    }

    if (!pendingCredential) {
      setError('Please sign in with Google first.');
      return;
    }

    setBusy(true);
    setStep('connecting');
    addLog(`Creating account for @${cleanUsername}...`);
    addLog('Querying Salt Service...');

    try {
      addLog('Securing your account...');
      const wallet = await loginWithGoogle(pendingCredential, cleanUsername);
      addLog('Setting up your identity...');
      addLog('Account successfully initialized!');
      onWallet(wallet);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err.message || 'Registration failed.';
      setError(msg);
      setStep('username');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={authStyles['auth-view']}>
      <div className={authStyles['auth-left']}>
        <div className={authStyles['auth-left-content']}>
          <img src="/logo.png" alt="kibo logo" style={{ width: '96px', height: '96px', borderRadius: '20px', marginBottom: '16px', objectFit: 'cover', filter: 'invert(1) contrast(1.2)' }} />
          <h1 style={{ color: 'var(--bg)', marginBottom: '8px', fontSize: '36px', fontWeight: 300, letterSpacing: '-0.02em' }}>Kibo</h1>
          <p style={{ color: 'var(--bg)', fontSize: '16px', fontWeight: 500 }}>Private conversational payments on Sui.</p>
        </div>
      </div>
      <div className={authStyles['auth-right']}>
        <div className={authStyles['auth-panel']}>
          <div className={authStyles['auth-header']}>
            <img src="/logo.png" alt="kibo" style={{ width: '48px', height: '48px', borderRadius: '14px', objectFit: 'cover' }} />
            <p className={authStyles['auth-tagline']}>
              {step === 'signin'
                ? (
                  <>
                    <span className={authStyles['desktop-text']}>Sign in to continue</span>
                    <span className={authStyles['mobile-text']}>Private conversational payments on Sui.</span>
                  </>
                )
                : step === 'username'
                  ? 'Choose your username'
                  : 'Authenticating...'}
            </p>
          </div>

          <div className={authStyles['auth-card']}>
            {step === 'signin' && (
              <div className={authStyles['auth-flow']}>
                <p className={authStyles['auth-note']}>
                  Sign in securely with your Google account to access your Kibo wallet.
                </p>
                <div className={authStyles['auth-actions']} style={{ display: 'flex', justifyContent: 'center', width: '100%', minHeight: '44px' }}>
                  <div id="google-signin-btn"></div>
                </div>
              </div>
            )}

            {step === 'username' && (
              <form className={authStyles['auth-flow']} onSubmit={handleRegisterSubmit}>
                <div className={`${formStyles.field} ${authStyles['auth-field']}`}>
                  <label>Choose Username</label>
                  <input
                    className={authStyles['auth-input']}
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="username"
                    required
                    disabled={busy}
                  />
                </div>
                <p className={authStyles['auth-note']}>Choose how you will be identified on Kibo.</p>
                <div className={authStyles['auth-actions']}>
                  <button
                    className={`${formStyles.btn} ${formStyles['btn-primary']} ${authStyles['auth-submit']}`}
                    type="submit"
                  >
                    Next
                  </button>
                </div>
              </form>
            )}



            {step === 'connecting' && (
              <div className={authStyles['auth-logs-container']}>
                <div className={authStyles['auth-spinner-container']}>
                  <span className={authStyles['auth-spinner']} />
                  <span style={{ fontSize: 13, color: 'var(--fg)' }}>Setting up your wallet...</span>
                </div>
                <div className={authStyles['auth-logs']}>
                  {logs.map((log, idx) => (
                    <div key={idx} className={authStyles['auth-log-line']}>{log}</div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className={`${formStyles['auth-error']} ${authStyles['auth-error-banner']}`}>
              {error}
            </div>
          )}

          {step !== 'signin' && !busy && (
            <div className={authStyles['auth-secondary-action']}>
              <button
                type="button"
                className={authStyles['auth-link']}
                onClick={() => setStep('signin')}
              >
                Start Over
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
