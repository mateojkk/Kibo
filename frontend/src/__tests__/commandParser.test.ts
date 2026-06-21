import { describe, it, expect } from 'vitest';
import { parseCommand } from '../lib/commandParser';

describe('parseCommand', () => {
  it('parses send command', () => {
    const cmd = parseCommand('send 1.5 to alice');
    expect(cmd.type).toBe('send');
    if (cmd.type === 'send') {
      expect(cmd.amount).toBe(1.5);
      expect(cmd.to).toBe('alice');
    }
  });

  it('parses pin set command', () => {
    const cmd = parseCommand('pin set');
    expect(cmd.type).toBe('pin-set');
  });

  it('parses send command with token symbol', () => {
    const cmd = parseCommand('send 5.2 pathUSD to bob');
    expect(cmd.type).toBe('send');
    if (cmd.type === 'send') {
      expect(cmd.amount).toBe(5.2);
      expect(cmd.to).toBe('bob');
      expect(cmd.tokenSymbol).toBe('pathusd');
    }
  });

});
