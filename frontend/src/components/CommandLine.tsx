import { useRef, useEffect, useState, type KeyboardEvent } from 'react';
import styles from '../styles/commandLine.module.css';

interface CommandLineProps {
  onSubmit: (input: string) => void;
  disabled?: boolean;
  isPassword?: boolean;
  history: string[];
  placeholder?: string;
  submitLabel?: string;
}

const COMMANDS = ['send', 'balance', 'contacts', 'add', 'remove', 'history', 'create', 'login', 'refresh', 'help', 'clear', 'whoami', 'pin set', 'disconnect', 'export'];

export default function CommandLine({
  onSubmit,
  disabled,
  isPassword,
  history,
  placeholder,
  submitLabel = 'Run',
}: CommandLineProps) {
  const [value, setValue] = useState('');
  const [histIdx, setHistIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus on mount and whenever clicked
  useEffect(() => {
    inputRef.current?.focus();
  }, [disabled]);

  const submitCommand = () => {
    const trimmed = isPassword ? value : value.trim();
    if (!trimmed && !isPassword) return;
    onSubmit(trimmed);
    setValue('');
    setHistIdx(-1);
  };

  const normalizedValue = value.trim().toLowerCase();
  const suggestions = isPassword || !normalizedValue
    ? []
    : [...COMMANDS, ...history]
        .filter((entry, index, arr) => arr.indexOf(entry) === index)
        .filter((entry) => entry.toLowerCase().startsWith(normalizedValue) && entry.toLowerCase() !== normalizedValue)
        .slice(0, 4);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      submitCommand();
    } else if (e.key === 'ArrowUp') {
      if (isPassword) return;
      e.preventDefault();
      const nextIdx = Math.min(histIdx + 1, history.length - 1);
      setHistIdx(nextIdx);
      setValue(history[nextIdx] ?? '');
    } else if (e.key === 'ArrowDown') {
      if (isPassword) return;
      e.preventDefault();
      const nextIdx = Math.max(histIdx - 1, -1);
      setHistIdx(nextIdx);
      setValue(nextIdx === -1 ? '' : history[nextIdx]);
    } else if (e.key === 'Tab') {
      if (isPassword) return;
      e.preventDefault();
      const match = COMMANDS.find((c) => c.startsWith(value.toLowerCase()));
      if (match) setValue(match + ' ');
    } else if (e.key === 'Escape') {
      setValue('');
      setHistIdx(-1);
    }
  };

  return (
    <div
      className={styles['command-line']}
      onClick={() => inputRef.current?.focus()}
    >
      <div className={styles['composer']}>
        <input
          ref={inputRef}
          className={styles['command-input']}
          data-command-input
          type={isPassword ? "password" : "text"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder={placeholder}
        />
        <button
          type="button"
          className={styles['command-send-button']}
          onClick={submitCommand}
          disabled={disabled}
          aria-label="Send message"
        >
          {submitLabel}
        </button>
      </div>
      {suggestions.length > 0 && (
        <div className={styles['command-suggestions']}>
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className={styles['command-suggestion']}
              onClick={() => {
                setValue(suggestion.includes(' ') ? suggestion : `${suggestion} `);
                inputRef.current?.focus();
              }}
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
