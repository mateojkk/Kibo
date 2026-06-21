import type { OutputLine } from '../../components/TerminalOutput';
import type { AgentWallet } from '../wallet';
import { getPersistedUsername, loginWithGoogle, generateMockGoogleJwt } from '../wallet';
import { getContacts, findContact } from '../contacts';

import { SUI_STABLECOINS } from '../suiChain';
import type { Command } from '../commandParser';
import type { Step } from './types';

type CommandContext = {
  cmd: Command;
  wallet: AgentWallet | null;
  setWallet: (wallet: AgentWallet | null) => void;
  setStep: (step: Step) => void;
  setContacts: (contacts: Awaited<ReturnType<typeof getContacts>>) => void;
  setBusy: (busy: boolean) => void;
  setLines: (lines: OutputLine[]) => void;
  bootLines: OutputLine[];
  push: (...lines: OutputLine[]) => void;
};

export async function handleCommand(
  { cmd, wallet, setWallet, setStep, setContacts, setBusy, setLines, bootLines, push }: CommandContext
): Promise<boolean> {
  if (cmd.type === 'clear') {
    setLines(bootLines);
    return true;
  }

  if (cmd.type === 'help') {
    push(
      { kind: 'separator' },
      { kind: 'info', text: '  KIBO PAYMENTS MENU' },
      { kind: 'separator' },
      { kind: 'output', text: '    send <amount> to <address>   send funds instantly via shielded pool' },
      { kind: 'separator' },
    );
    return true;
  }

  if (cmd.type === 'create') {
    if (wallet) {
      push({ kind: 'info', text: `already connected: @${wallet.username} · ${wallet.address}` });
      return true;
    }
    push({ kind: 'info', text: 'creating a new Kibo wallet. enter email:' });
    setStep({ flow: 'connect-new', step: 'email' });
    return true;
  }

  if (cmd.type === 'login') {
    if (wallet) {
      push({ kind: 'info', text: `already connected: @${wallet.username} · ${wallet.address}` });
      return true;
    }
    const lastUser = getPersistedUsername();
    if (lastUser && lastUser.includes('@')) {
      setBusy(true);
      push({ kind: 'info', text: `reconnecting @${lastUser}... fetching salt...` });
      try {
        const restoredWallet = await loginWithGoogle(generateMockGoogleJwt(lastUser));
        setWallet(restoredWallet);
        push({ kind: 'success', text: `✓ welcome back, @${restoredWallet.username}` });
        push({ kind: 'output', text: `  address: ${restoredWallet.address}` });
      } catch (e: any) {
        push({ kind: 'error', text: `reconnect failed: ${e.message}. enter email:` });
        setStep({ flow: 'connect-load', step: 'email' });
      } finally {
        setBusy(false);
      }
    } else {
      push({ kind: 'info', text: 'enter your email address:' });
      setStep({ flow: 'connect-load', step: 'email' });
    }
    return true;
  }



  if (cmd.type === 'refresh') {
    push({ kind: 'info', text: 'reloading chat...' });
    window.location.reload();
    return true;
  }








  if (cmd.type === 'send') {
    if (!wallet) { push({ kind: 'error', text: 'no wallet — type `login` or `create`' }); return true; }

    const tokenSymbol = cmd.tokenSymbol || 'USDC';
    const token = SUI_STABLECOINS.find(
      (t) => t.symbol.toLowerCase() === tokenSymbol.toLowerCase()
    );
    
    if (!token) {
      push({ kind: 'error', text: `token not supported: "${cmd.tokenSymbol}"` });
      return true;
    }

    try {
      const cleaned = cmd.to.trim().replace(/^@/, '');
      const freshContacts = await getContacts().catch(() => []);
      if (freshContacts.length > 0) {
        setContacts(freshContacts);
      }
      const contact = findContact(cleaned, freshContacts);
      const recipientAddress = contact
        ? contact.address
        : /^0x[0-9a-fA-F]{64}$/.test(cleaned)
        ? cleaned
        : null;
        
      if (!recipientAddress) {
        push({ kind: 'error', text: `unknown recipient: "${cmd.to}" — use a saved contact or full Sui address` });
        return true;
      }
      
      const contactName = contact ? contact.name : `${recipientAddress.slice(0, 6)}...${recipientAddress.slice(-4)}`;
      const displaySymbol = token.symbol === 'USDC' ? '$' : token.symbol;
      push({ 
        kind: 'output', 
        text: `Are you sure you want to send ${displaySymbol}${cmd.amount} to @${contactName}? \nType 'y' to confirm or 'n' to cancel.` 
      });
      setStep({
        flow: 'confirm-send',
        pending: { 
          amount: cmd.amount, 
          to: cmd.to, 
          recipientAddress, 
          tokenSymbol: token.symbol,
        },
      });
    } catch (e: any) {
      push({ kind: 'error', text: `failed to verify pin status: ${e.message || 'unauthorized'}` });
    }
    return true;
  }



  if (cmd.type === 'history') {
    if (!wallet) { push({ kind: 'error', text: 'no wallet — type `login` or `create`' }); return true; }
    push({
      kind: 'link',
      text: '  view on explorer ↗',
      href: `https://testnet.suivision.xyz/account/${wallet.address}`,
    });
    return true;
  }

  if (cmd.type === 'greeting') {
    push({ kind: 'output', text: 'hi. type `help` to see what i can do.' });
    return true;
  }

  if (cmd.type === 'unknown') {
    push({ kind: 'error', text: `unknown command: "${cmd.raw}". type \`help\`` });
    return true;
  }

  return false;
}
