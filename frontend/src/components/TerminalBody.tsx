import type { RefObject } from 'react';
import TerminalOutput, { type OutputLine } from './TerminalOutput';
import bodyStyles from '../styles/terminalBody.module.css';
import outputStyles from '../styles/terminalOutput.module.css';

type TerminalBodyProps = {
  lines: OutputLine[];
  busy: boolean;
  bottomRef: RefObject<HTMLDivElement | null>;
};

export default function TerminalBody({ lines, busy, bottomRef }: TerminalBodyProps) {
  return (
    <div className={bodyStyles['terminal-body']}>
      <TerminalOutput lines={lines} />
      {busy && (
        <div className={`${outputStyles['term-line']} ${outputStyles['term-info']} ${outputStyles['term-spin']}`}>
          ⠋ processing...
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
