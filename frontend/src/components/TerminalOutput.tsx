

import styles from '../styles/terminalOutput.module.css';

export type OutputLine =
  | { kind: 'input'; text: string }
  | { kind: 'output'; text: string }
  | { kind: 'error'; text: string }
  | { kind: 'success'; text: string }
  | { kind: 'info'; text: string }
  | { kind: 'link'; text: string; href: string }
  | { kind: 'separator' };

interface TerminalOutputProps {
  lines: OutputLine[];
}

export default function TerminalOutput({ lines }: TerminalOutputProps) {
  const kindClassMap: Record<OutputLine['kind'], string> = {
    input: styles['bubble-user'],
    output: styles['bubble-assistant'],
    error: styles['bubble-error'],
    success: styles['bubble-success'],
    info: styles['bubble-info'],
    link: styles['bubble-link'],
    separator: styles['term-separator'],
  };

  return (
    <div className={styles['terminal-output']}>
      {lines.map((line, i) => {
        if (line.kind === 'separator') {
          return <div key={i} className={styles['term-separator']} />;
        }
        if (line.kind === 'link') {
          return (
            <div key={i} className={`${styles['term-row']} ${styles['row-assistant']}`}>
              <div className={`${styles['term-bubble']} ${kindClassMap.link}`}>
                <a
                  href={line.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles['term-link']}
                >
                  {line.text}
                </a>
              </div>
            </div>
          );
        }
        return (
          <div
            key={i}
            className={`${styles['term-row']} ${line.kind === 'input' ? styles['row-user'] : styles['row-assistant']}`}
          >
            <div className={`${styles['term-bubble']} ${kindClassMap[line.kind]}`}>
              {line.text}
            </div>
          </div>
        );
      })}
    </div>
  );
}
