import type { RefObject } from 'react';
import TerminalOutput, { type OutputLine } from './TerminalOutput';
import ConfirmTransferCard from './ConfirmTransferCard';
import type { Step } from '../lib/terminal/types';
import bodyStyles from '../styles/terminalBody.module.css';
import outputStyles from '../styles/terminalOutput.module.css';

type TerminalBodyProps = {
  lines: OutputLine[];
  busy: boolean;
  bottomRef: RefObject<HTMLDivElement | null>;
  step?: Step | null;
  onConfirmSend?: () => void;
  onCancelSend?: () => void;
};

export default function TerminalBody({ lines, busy, bottomRef, step, onConfirmSend, onCancelSend }: TerminalBodyProps) {
  return (
    <div className={bodyStyles['terminal-body']}>
      <TerminalOutput lines={lines} />
      {step?.flow === 'confirm-send' && onConfirmSend && onCancelSend && (
        <div style={{ maxWidth: '1200px', width: '100%', margin: '0 auto' }}>
          <div className={`${outputStyles['term-row']} ${outputStyles['row-assistant']}`}>
            <div className={`${outputStyles['term-bubble']} ${outputStyles['bubble-assistant']}`} style={{ padding: 0 }}>
              <ConfirmTransferCard 
                amount={step.pending.amount}
                tokenSymbol={step.pending.tokenSymbol}
                to={step.pending.to}
                isPrivate={step.pending.isPrivate}
                onConfirm={onConfirmSend}
                onCancel={onCancelSend}
                busy={busy}
              />
            </div>
          </div>
        </div>
      )}
      {busy && (
        <div style={{ maxWidth: '1200px', width: '100%', margin: '0 auto', padding: '0 1.5rem' }}>
          <div className={`${outputStyles['term-line']} ${outputStyles['term-info']} ${outputStyles['term-spin']}`}>
            ⠋ processing...
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
