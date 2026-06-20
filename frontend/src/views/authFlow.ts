export type AuthStep = 'email' | 'code' | 'username' | 'connecting' | 'error';

export interface PendingSignupDraft {
  email: string;
  requestedUsername: string;
  username: string;
}

export const EMPTY_PENDING_SIGNUP: PendingSignupDraft = {
  email: '',
  requestedUsername: '',
  username: '',
};



export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function getPostLoginStep(isNewUser: boolean): AuthStep {
  return isNewUser ? 'username' : 'connecting';
}
