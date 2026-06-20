export type Step =
  | null
  | { flow: 'connect-new';   step: 'email' }
  | { flow: 'connect-new';   step: 'username'; email: string }
  | { flow: 'connect-new';   step: 'inviteCode'; email: string; username: string }
  | { flow: 'connect-load';  step: 'email' }
  | { flow: 'pin-set';       step: 'pin' }
  | { flow: 'pin-set';       step: 'confirm'; pin: string }
  | { flow: 'pin-verify';    step: 'pin'; attempts: number; pending: { amount: number; to: string; recipientAddress: string; tokenSymbol?: string; isPrivate?: boolean } }
  | { flow: 'claim-private'; step: 'salt'; amount: number; commitment?: string };
