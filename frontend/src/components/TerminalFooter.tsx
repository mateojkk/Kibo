import KiboChatInput from './ui/KiboChatInput';
import styles from '../styles/terminalFooter.module.css';

type TerminalFooterProps = {
  onSubmit: (input: string) => void;
  disabled: boolean;
  history: string[];
  isPassword: boolean;
  helperText: string;
  quickActions: string[];
  submitLabel: string;
  isPrivateMode?: boolean;
  setIsPrivateMode?: (v: boolean) => void;
};

export default function TerminalFooter({
  onSubmit,
  disabled,
  history,
  isPassword,
  helperText,
  quickActions,
  submitLabel,
  isPrivateMode,
  setIsPrivateMode,
}: TerminalFooterProps) {
  const showHelper = helperText.trim().length > 0;

  return (
    <div className={styles['terminal-footer']}>
      {showHelper && (
        <div className={styles['terminal-helper-bar']}>
          <div className={styles['terminal-helper-text']}>{helperText}</div>
        </div>
      )}
      <KiboChatInput
        onSubmit={onSubmit}
        disabled={disabled}
        history={history}
        isPassword={isPassword}
        quickActions={quickActions}
        submitLabel={submitLabel}
        isPrivateMode={isPrivateMode}
        setIsPrivateMode={setIsPrivateMode}
      />
    </div>
  );
}
