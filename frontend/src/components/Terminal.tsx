import { useEffect, useRef } from 'react';
import TerminalBody from './TerminalBody';
import TerminalFooter from './TerminalFooter';
import ConfirmTransferCard from './ConfirmTransferCard';

import { useTerminalController } from '../lib/terminal/useTerminalController';
import { stepMasksInput } from '../lib/terminal/stepFlow';
import type { Step } from '../lib/terminal/types';
import styles from '../styles/terminalShell.module.css';

import type { AgentWallet } from '../lib/wallet';

type TerminalProps = {
  wallet?: AgentWallet | null;
  onWalletChange?: (wallet: AgentWallet | null) => void;
};

export default function Terminal({ wallet: externalWallet, onWalletChange }: TerminalProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const {
    lines,
    cmdHistory,
    busy,
    step,
    isPrivateMode,
    setIsPrivateMode,
    handleSubmit,
    confirmSendTransaction,
    cancelSendTransaction,
  } = useTerminalController({ wallet: externalWallet, onWalletChange });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);
  
  const helperText = step
    ? getStepHelper(step)
    : '';
  const quickActions: string[] = [];
  const submitLabel = step ? 'Next' : 'Send';

  return (
    <div
      className={styles['terminal-root']}
      onClick={(e) => {
        (e.currentTarget as HTMLElement)
          .querySelector<HTMLInputElement>('[data-command-input]')
          ?.focus();
      }}
    >
      <TerminalBody lines={lines} busy={busy} bottomRef={bottomRef} />
      {step?.flow === 'confirm-send' ? (
        <div style={{ padding: '0 24px', width: '100%', marginBottom: '16px' }}>
          <ConfirmTransferCard 
            amount={step.pending.amount}
            tokenSymbol={step.pending.tokenSymbol}
            to={step.pending.to}
            isPrivate={step.pending.isPrivate}
            onConfirm={confirmSendTransaction}
            onCancel={cancelSendTransaction}
            busy={busy}
          />
        </div>
      ) : (
        <TerminalFooter
          onSubmit={handleSubmit}
          disabled={busy}
          history={cmdHistory}
          isPassword={stepMasksInput(step)}
          helperText={helperText}
          quickActions={quickActions}
          submitLabel={submitLabel}
          isPrivateMode={isPrivateMode}
          setIsPrivateMode={setIsPrivateMode}
        />
      )}
    </div>
  );
}


function getStepHelper(step: NonNullable<Step>) {
  switch (step.flow) {
    case 'connect-new':
      if (step.step === 'email') return 'Creating a new wallet. We will ask for your email first.';
      if (step.step === 'username') return `Choosing username for ${step.email}.`;
      return 'Enter invite code to claim your new wallet.';
    case 'connect-load':
      return 'Enter your email address to log in.';
    case 'claim-private':
      return `Claiming private payment of ${step.amount} USDC.`;
    default:
      return 'Follow the prompt to continue.';
  }
}
