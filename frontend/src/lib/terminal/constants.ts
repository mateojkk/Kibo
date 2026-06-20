import type { OutputLine } from '../../components/TerminalOutput';

export const BOOT_LINES: OutputLine[] = [
  { kind: 'separator' },
  { kind: 'info',   text: '  type `help` to get started' },
  { kind: 'separator' },
];
