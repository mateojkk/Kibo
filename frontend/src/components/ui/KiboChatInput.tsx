import { ArrowUp, History, Send, Shield, Wallet, Lock, Unlock } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import styles from '../../styles/kiboChatInput.module.css';

type KiboChatInputProps = {
  onSubmit: (input: string) => void;
  disabled?: boolean;
  isPassword?: boolean;
  history: string[];
  quickActions: string[];
  submitLabel?: string;
  isPrivateMode?: boolean;
  setIsPrivateMode?: (v: boolean) => void;
};

const COMMANDS = ['send', 'claim', 'balance', 'contacts', 'history', 'pin set', 'help', 'clear', 'whoami', 'login', 'create'];

const ACTION_ICONS: Record<string, typeof Wallet> = {
  balance: Wallet,
  history: History,
  contacts: Shield,
  help: Send,
};

export default function KiboChatInput({
  onSubmit,
  disabled,
  isPassword,
  history,
  quickActions,
  submitLabel = 'Send',
  isPrivateMode = false,
  setIsPrivateMode,
}: KiboChatInputProps) {
  const [value, setValue] = useState('');
  const [histIdx, setHistIdx] = useState(-1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
     if (isPassword) {
       passwordRef.current?.focus();
     }
  }, [disabled, isPassword]);

  useEffect(() => {
    if (isPassword || !textareaRef.current) return;
    textareaRef.current.style.height = 'auto';
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 140)}px`;
  }, [value, isPassword]);

  const normalizedValue = value.trim().toLowerCase();
  const suggestions = useMemo(() => {
    if (isPassword || !normalizedValue) return [];
    return [...COMMANDS, ...history]
      .filter((entry, index, arr) => arr.indexOf(entry) === index)
      .filter((entry) => entry.toLowerCase().startsWith(normalizedValue) && entry.toLowerCase() !== normalizedValue)
      .slice(0, 4);
  }, [history, isPassword, normalizedValue]);

  const submitCommand = () => {
    const trimmed = isPassword ? value : value.trim();
    if (!trimmed && !isPassword) return;
    onSubmit(trimmed);
    setValue('');
    setHistIdx(-1);
    if (!isPassword && textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleHistoryNav = (direction: 'up' | 'down') => {
    if (isPassword) return;
    const nextIdx = direction === 'up'
      ? Math.min(histIdx + 1, history.length - 1)
      : Math.max(histIdx - 1, -1);
    setHistIdx(nextIdx);
    setValue(nextIdx === -1 ? '' : history[nextIdx] ?? '');
  };

  const handleTextKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitCommand();
      return;
    }
    if (e.key === 'ArrowUp' && !value.trim()) {
      e.preventDefault();
      handleHistoryNav('up');
      return;
    }
    if (e.key === 'ArrowDown' && histIdx !== -1) {
      e.preventDefault();
      handleHistoryNav('down');
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const match = COMMANDS.find((c) => c.startsWith(value.toLowerCase()));
      if (match) setValue(`${match} `);
      return;
    }
    if (e.key === 'Escape') {
      setValue('');
      setHistIdx(-1);
    }
  };

  const handlePasswordKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitCommand();
    }
  };

  return (
    <div className={styles.root}>
      {quickActions.length > 0 && !value.trim() && !isPassword && (
        <div className={styles.quickActions}>
          {quickActions.map((action) => {
            const Icon = ACTION_ICONS[action];
            return (
              <button
                key={action}
                type="button"
                className={styles.quickAction}
                onClick={() => onSubmit(action)}
                disabled={disabled}
              >
                {Icon ? <Icon size={14} /> : null}
                <span>{action}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className={`${styles.composer} ${isPrivateMode && !isPassword ? styles.composerPrivate : ''}`}>
        <div className={styles.inputWrap}>
          {isPassword ? (
            <input
              ref={passwordRef}
              className={styles.passwordInput}
              data-command-input
              type="password"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handlePasswordKeyDown}
              disabled={disabled}
              autoComplete="off"
              placeholder=""
            />
          ) : (
            <textarea
              ref={textareaRef}
              className={styles.textarea}
              data-command-input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleTextKeyDown}
              disabled={disabled}
              placeholder="type 'help' to get started"
              rows={1}
            />
          )}
        </div>

        <div className={styles.composerFooter}>
          <div className={styles.composerFooterLeft}>
            {setIsPrivateMode && !isPassword && (
              <button
                type="button"
                className={`${styles.toggleButton} ${isPrivateMode ? styles.privateActive : styles.privateInactive}`}
                onClick={() => setIsPrivateMode(!isPrivateMode)}
                title={isPrivateMode ? 'Private Mode Active (Transactions are Shielded)' : 'Private Mode Inactive (Transactions are Public)'}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '12px', background: isPrivateMode ? 'var(--accent-alpha)' : 'transparent', border: isPrivateMode ? '1px solid var(--accent)' : '1px solid var(--border-hl)', color: isPrivateMode ? 'var(--accent)' : 'var(--fg-muted)' }}
              >
                {isPrivateMode ? <Lock size={14} /> : <Unlock size={14} />}
                <span style={{ fontSize: '11px', fontWeight: 500, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                  {isPrivateMode ? 'Shielded' : 'Public'}
                </span>
              </button>
            )}
          </div>
          <button
            type="button"
            className={styles.sendButton}
            onClick={submitCommand}
            disabled={disabled || (!isPassword && !value.trim())}
            aria-label={submitLabel}
          >
            <ArrowUp size={16} />
          </button>
        </div>
      </div>

      {suggestions.length > 0 && (
        <div className={styles.suggestions}>
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className={styles.suggestion}
              onClick={() => {
                setValue(suggestion.includes(' ') ? suggestion : `${suggestion} `);
                textareaRef.current?.focus();
              }}
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      {!isPassword && (
        <div className={styles.disclaimer}>
          <Lock size={10} /> Deterministic input/output to ensure your funds are safe.
        </div>
      )}
    </div>
  );
}
