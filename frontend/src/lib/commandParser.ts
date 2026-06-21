// commandParser.ts — parses raw terminal input into typed commands

export type Command =
  | { type: 'send'; amount: number; to: string; tokenSymbol?: string }
  | { type: 'claim'; amount: number; salt?: string }
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
  | { type: 'greeting' }
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

  // Conversational send matching
  // Matches: "send 5 usdc to bob", "can you transfer 10 to alice", "pay 5 to @jk"
  const sendPattern1 = /(?:send|transfer|pay|give|shoot)[^\d]*([\d.]+)\s*(usdc)?\s*(?:to\s+)?@?([a-z0-9.-]+)/i;
  // Matches: "pay alice 10 usdc"
  const sendPattern2 = /(?:send|transfer|pay|give|shoot)\s+@?([a-z]+[a-z0-9.-]*)\s+([\d.]+)\s*(usdc)?/i;

  let sendMatch = lower.match(sendPattern1);
  if (sendMatch) {
    const amount = parseFloat(sendMatch[1]);
    const tokenSymbol = sendMatch[2] || 'USDC';
    const to = sendMatch[3];
    if (!isNaN(amount) && amount > 0 && to && to !== 'please' && to !== 'usdc') {
      return { type: 'send', amount, to, tokenSymbol };
    }
  }

  sendMatch = lower.match(sendPattern2);
  if (sendMatch) {
    const to = sendMatch[1];
    const amount = parseFloat(sendMatch[2]);
    const tokenSymbol = sendMatch[3] || 'USDC';
    if (!isNaN(amount) && amount > 0 && to && to !== 'please') {
      return { type: 'send', amount, to, tokenSymbol };
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

  // Conversational keyword matching
  if (lower.includes('contact') || lower.includes('book') || lower === 'ls') {
    return { type: 'contacts' };
  }
  if (lower.includes('history') || lower.includes('transaction') || lower.includes('activity')) {
    return { type: 'history' };
  }
  if (lower.includes('help') || lower.includes('what can you do') || lower.includes('menu') || lower === '?') {
    return { type: 'help' };
  }
  if (/^(hi|hello|hey|yo|sup|greetings)\b/i.test(lower) || lower.includes('what\'s up') || lower.includes('whats up')) {
    return { type: 'greeting' };
  }

  // Single-word commands
  switch (lower) {
    case 'create':
      return { type: 'create' };
    case 'login':
      return { type: 'login' };
    case 'disconnect':
      return { type: 'disconnect' };
    case 'refresh':
    case 'reload':
      return { type: 'refresh' };
    case 'clear':
    case 'cls':
      return { type: 'clear' };
    case 'whoami':
      return { type: 'whoami' };
    default:
      return { type: 'unknown', raw: trimmed };
  }
}
