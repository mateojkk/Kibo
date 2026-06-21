import type { OutputLine } from '../../components/TerminalOutput';
import type { AgentWallet } from '../wallet';
import { loginWithGoogle, generateMockGoogleJwt } from '../wallet';

import type { Step } from './types';

type StepContext = {
  raw: string;
  step: Step;
  setStep: (step: Step) => void;
  setWallet: (wallet: AgentWallet | null) => void;
  setBusy: (busy: boolean) => void;
  push: (...lines: OutputLine[]) => void;
};

export function stepMasksInput(_step?: Step | null): boolean {
  return false;
}

export async function handleStepInput({
  raw,
  step,
  setStep,
  setWallet,
  setBusy,
  push,
}: StepContext): Promise<boolean> {
  if (!step) return false;

  const mask = stepMasksInput(step);
  push({ kind: 'input', text: mask ? '••••••' : raw });

  if (step.flow === 'connect-new') {
    if (step.step === 'email') {
      const email = raw.trim().toLowerCase();
      if (!email.includes('@') || !email.includes('.')) {
        push({ kind: 'error', text: 'enter a valid email address' });
        return true;
      }
      setStep({ flow: 'connect-new', step: 'username', email });
      push({ kind: 'info', text: 'choose your Kibo username:' });
      return true;
    }
    
    if (step.step === 'username') {
      const username = raw.trim().toLowerCase();
      if (username.length < 3) {
        push({ kind: 'error', text: 'username must be at least 3 characters' });
        return true;
      }
      if (!/^[a-z0-9_]+$/.test(username)) {
        push({ kind: 'error', text: 'username can only contain letters, numbers, and underscores' });
        return true;
      }
      setStep(null);
      setBusy(true);
      push({ kind: 'info', text: 'fetching salt and generating keypairs...' });
      try {
        const wallet = await loginWithGoogle(generateMockGoogleJwt(step.email), username);
        setWallet(wallet);
        push(
          { kind: 'success', text: `✓ wallet created for ${wallet.username}` },
          { kind: 'output', text: `  address: ${wallet.address}` },
          { kind: 'info', text: '  use Kibo privately or publicly gaslessly!' },
          { kind: 'separator' }
        );
      } catch (e: any) {
        push({ kind: 'error', text: `failed: ${e.response?.data?.detail || e.message}` });
      } finally {
        setBusy(false);
      }
      return true;
    }
  }

  if (step.flow === 'connect-load') {
    if (step.step === 'email') {
      const email = raw.trim().toLowerCase();
      if (!email.includes('@') || !email.includes('.')) {
        push({ kind: 'error', text: 'enter a valid email address' });
        return true;
      }
      setStep(null);
      setBusy(true);
      push({ kind: 'info', text: 'fetching salt and deriving keys...' });
      try {
        const wallet = await loginWithGoogle(generateMockGoogleJwt(email));
        setWallet(wallet);
        push({ kind: 'success', text: `✓ welcome back, ${wallet.username}` });
        push({ kind: 'output', text: `  address: ${wallet.address}` });
      } catch (e: any) {
        push({ kind: 'error', text: `login failed: ${e.response?.data?.detail || e.message}` });
      } finally {
        setBusy(false);
      }
      return true;
    }
  }



  if (step.flow === 'confirm-send') {
    setStep(null);
    push({ kind: 'error', text: 'transfer cancelled' });
    return true;
  }

  return true;
}

