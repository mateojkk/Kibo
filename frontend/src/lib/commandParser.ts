// commandParser.ts — parses raw terminal input into typed commands

export type Command =
  | { type: 'send'; amount: number; to: string; tokenSymbol?: string }
  | { type: 'claim'; amount: number; salt?: string }
  | { type: 'balance'; tokenSymbol?: string }
  | { type: 'contacts' }
  | { type: 'add'; name: string; address: string }
  | { type: 'remove'; name: string }
  | { type: 'create' }
  | { type: 'login' }
  | { type: 'pin-set' }
  | { type: 'history' }
  | { type: 'disconnect' }
  | { type: 'refresh' }
  | { type: 'help' }
  | { type: 'clear' }
  | { type: 'whoami' }
  | { type: 'unknown'; raw: string };

export function parseCommand(input: string): Command {
  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();
  const parts = trimmed.split(/\s+/);

  // claim <amount> [salt]
  const claimWithSalt = lower.match(/^claim\s+([\d.]+)\s+([a-fA-F0-9]{64})$/);
  if (claimWithSalt) {
    const amount = parseFloat(claimWithSalt[1]);
    const salt = parts[2];
    if (!isNaN(amount) && amount > 0 && salt) {
      return { type: 'claim', amount, salt };
    }
  }

  const claimSimple = lower.match(/^claim\s+([\d.]+)$/);
  if (claimSimple) {
    const amount = parseFloat(claimSimple[1]);
    if (!isNaN(amount) && amount > 0) {
      return { type: 'claim', amount };
    }
  }

  // send <amount> [tokenSymbol] to <name|address>
  const sendMatchWithToken = lower.match(/^send\s+([\d.]+)\s+([a-zA-Z0-9.-]+)\s+to\s+(.+)$/);
  if (sendMatchWithToken) {
    const amount = parseFloat(sendMatchWithToken[1]);
    const tokenSymbol = sendMatchWithToken[2];
    const to = parts.slice(4).join(' ').trim();
    if (!isNaN(amount) && amount > 0 && to) {
      return { type: 'send', amount, to, tokenSymbol };
    }
  }

  const sendMatchSimple = lower.match(/^send\s+([\d.]+)\s+to\s+(.+)$/);
  if (sendMatchSimple) {
    const amount = parseFloat(sendMatchSimple[1]);
    const to = parts.slice(3).join(' ').trim();
    if (!isNaN(amount) && amount > 0 && to) {
      return { type: 'send', amount, to };
    }
  }

  // add <name> <address>
  if (lower.startsWith('add ') && parts.length === 3) {
    return { type: 'add', name: parts[1], address: parts[2] };
  }

  // remove <name>
  if ((lower.startsWith('remove ') || lower.startsWith('rm ')) && parts.length === 2) {
    return { type: 'remove', name: parts[1] };
  }

  if (lower === 'pin set' || lower === 'set pin') {
    return { type: 'pin-set' };
  }

  // balance [tokenSymbol]
  if (lower.startsWith('balance ')) {
    const symbol = parts.slice(1).join(' ').trim();
    if (symbol) {
      return { type: 'balance', tokenSymbol: symbol };
    }
  }

  // Single-word commands
  switch (lower) {
    case 'balance':
      return { type: 'balance' };
    case 'contacts':
    case 'book':
    case 'ls':
      return { type: 'contacts' };
    case 'history':
    case 'hist':
      return { type: 'history' };
    case 'create':
      return { type: 'create' };
    case 'login':
      return { type: 'login' };
    case 'disconnect':
      return { type: 'disconnect' };
    case 'refresh':
    case 'reload':
      return { type: 'refresh' };
    case 'help':
    case '?':
      return { type: 'help' };
    case 'clear':
    case 'cls':
      return { type: 'clear' };
    case 'whoami':
      return { type: 'whoami' };
    default:
      return { type: 'unknown', raw: trimmed };
  }
}
