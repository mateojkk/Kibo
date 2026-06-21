declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential?: string; select_by?: string }) => void;
            cancel_on_tap_outside?: boolean;
          }) => void;
          prompt: (momentListener?: (notification: { isNotDisplayed: () => boolean; isSkippedMoment: () => boolean; getNotDisplayedReason: () => string }) => void) => void;
          renderButton: (element: HTMLElement, options: { theme?: string; size?: string; type?: string; shape?: string; text?: string }) => void;
        };
      };
    };
  }
}

let pendingCallback: ((credential: string) => void) | null = null;
let initialized = false;

export function initGoogleAuth(clientId: string): void {
  if (!clientId || initialized) return;

  const waitForGis = () => {
    if (!window.google?.accounts?.id) {
      setTimeout(waitForGis, 200);
      return;
    }

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => {
        if (response.credential && pendingCallback) {
          const cb = pendingCallback;
          pendingCallback = null;
          cb(response.credential);
        }
      },
      cancel_on_tap_outside: false,
    });

    initialized = true;
  };

  waitForGis();
}

export function triggerGoogleSignIn(onCredential: (credential: string) => void): void {
  pendingCallback = onCredential;
  if (window.google?.accounts?.id) {
    window.google.accounts.id.prompt();
  }
}
