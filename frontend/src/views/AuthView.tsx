import React, { useState, useEffect } from 'react';
import type { AgentWallet } from '../lib/wallet';
import { loginWithGoogle } from '../lib/wallet';
import { initGoogleAuth, triggerGoogleSignIn } from '../lib/googleAuth';
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
    initGoogleAuth(clientId);
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

  const handleGoogleSignIn = () => {
    triggerGoogleSignIn(handleGoogleCredential);
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
                ? 'Sign in to continue'
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
                <div className={authStyles['auth-actions']}>
                  <button
                    type="button"
                    className={authStyles['google-btn']}
                    onClick={handleGoogleSignIn}
                    disabled={busy}
                  >
                    <svg viewBox="0 0 24 24" width="18" height="18">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.85z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Continue with Google
                  </button>
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
