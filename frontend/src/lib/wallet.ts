import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { SUI_TESTNET_RPC } from './suiChain';
import { baseApi, setAuthToken, getAuthToken } from '../api';

// Initialize the Sui Client
export const suiClient = new SuiClient({ url: SUI_TESTNET_RPC });

export interface AgentWallet {
  readonly address: string;
  readonly keypair?: Ed25519Keypair; // Keypair for local Ed25519 signing
  readonly email: string;
  readonly username: string;
  readonly pfp?: string;
  readonly isZkLogin: boolean;
  readonly jwt?: string; // Google OAuth JWT
}

// ─── Local Storage Keys ───────────────────────────────────────────────────
const STORAGE_USER_KEY = 'kibo_wallet_username';
const STORAGE_EMAIL_KEY = 'kibo_wallet_email';
const STORAGE_SUB_KEY = 'kibo_wallet_sub';
const STORAGE_ADDR_KEY = 'kibo_wallet_address';
const STORAGE_JWT_KEY = 'kibo_wallet_jwt';
const STORAGE_SALT_KEY = 'kibo_wallet_salt';

export function getPersistedUsername(): string | null {
  return localStorage.getItem(STORAGE_EMAIL_KEY) || localStorage.getItem(STORAGE_USER_KEY);
}

export function getPersistedEmail(): string | null {
  return localStorage.getItem(STORAGE_EMAIL_KEY);
}

// ─── Ephemeral Key Generator ──────────────────────────────────────────────
export async function deriveKeypairFromSubAndSalt(sub: string, salt: string): Promise<Ed25519Keypair> {
  // Hash the sub + salt to get a deterministic 32-byte seed for Ed25519
  const encoder = new TextEncoder();
  const data = encoder.encode(`${sub}:${salt}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const seed = new Uint8Array(hashBuffer);
  return Ed25519Keypair.fromSecretKey(seed);
}

// ─── Auth/Onboarding Flows ────────────────────────────────────────────────

function parseJwtPayload(jwt: string): Record<string, unknown> {
  try {
    const payload = jwt.split('.')[1];
    return JSON.parse(atob(payload));
  } catch {
    return {};
  }
}

export function generateMockGoogleJwt(email: string): string {
  const header = { alg: 'RS256', typ: 'JWT', kid: 'google-mock-key' };
  const payload = {
    iss: 'https://accounts.google.com',
    sub: `google-oauth2|${email}`,
    email,
    aud: 'kibo-client-id',
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  return `${btoa(JSON.stringify(header))}.${btoa(JSON.stringify(payload))}.mocksignature`;
}

/**
 * Authenticates using a Google OAuth credential JWT (zkLogin).
 * The credential comes from Google Identity Services via the one-tap or button flow.
 * In dev/testnet, a mock JWT is generated as fallback when no real credential exists.
 */
export async function loginWithGoogle(
  credential: string,
  requestedUsername?: string
): Promise<AgentWallet> {
  const claims = parseJwtPayload(credential);
  const sub = claims.sub as string || '';
  const email = (claims.email as string || '').toLowerCase();

  // 1. Fetch deterministic salt from backend Salt Service (keyed by sub)
  const saltResp = await baseApi.post('/auth/zklogin/salt', { identifier: sub });
  const salt = saltResp.data?.salt as string;
  if (!salt) {
    throw new Error('Failed to retrieve user salt');
  }

  // 2. Derive keypair locally from sub + salt
  const keypair = await deriveKeypairFromSubAndSalt(sub, salt);
  const address = keypair.getPublicKey().toSuiAddress();

  // 4. Authenticate on Kibo Backend
  const resp = await baseApi.post('/auth/zklogin', {
    jwt: credential,
    walletAddress: address,
    email,
    username: requestedUsername || '',
  });

  const sessionToken = resp.data?.token;
  if (sessionToken) {
    setAuthToken(sessionToken);
  }

  let username = resp.data?.username || email.split('@')[0];
  if (!username.endsWith('.kibo')) username += '.kibo';
  const pfp = resp.data?.pfp || '';

  // 5. Persist Session Info
  localStorage.setItem(STORAGE_USER_KEY, username);
  localStorage.setItem(STORAGE_EMAIL_KEY, email);
  localStorage.setItem(STORAGE_SUB_KEY, sub);
  localStorage.setItem(STORAGE_ADDR_KEY, address);
  localStorage.setItem(STORAGE_SALT_KEY, salt);
  localStorage.setItem(STORAGE_JWT_KEY, credential);

  return {
    address,
    keypair,
    email,
    username,
    pfp,
    isZkLogin: true,
    jwt: credential,
  };
}

/**
 * Try to restore a previous session without needing credentials.
 */
export async function tryRestoreSession(): Promise<AgentWallet | null> {
  let username = localStorage.getItem(STORAGE_USER_KEY);
  if (username && !username.endsWith('.kibo')) {
    username += '.kibo';
    localStorage.setItem(STORAGE_USER_KEY, username);
  }
  const email = localStorage.getItem(STORAGE_EMAIL_KEY);
  const sub = localStorage.getItem(STORAGE_SUB_KEY);
  const address = localStorage.getItem(STORAGE_ADDR_KEY);
  const salt = localStorage.getItem(STORAGE_SALT_KEY);
  const jwtToken = localStorage.getItem(STORAGE_JWT_KEY);
  const authToken = getAuthToken();

  if (!username || !sub || !address || !salt || !authToken) {
    return null;
  }

  try {
    const keypair = await deriveKeypairFromSubAndSalt(sub, salt);
    
    // Validate session with backend
    const resp = await baseApi.get('/auth/me');
    const freshUsername = resp.data?.username || username;
    const freshPfp = resp.data?.pfp || '';

    return {
      address,
      keypair,
      email: email || '',
      username: freshUsername,
      pfp: freshPfp,
      isZkLogin: !!jwtToken,
      jwt: jwtToken || undefined,
    };
  } catch (err: any) {
    const status = err?.response?.status;
    if (status === 401 || status === 403) {
      setAuthToken(null);
    }
    return null;
  }
}

/**
 * Log out and clear session state.
 */
export async function destroyWallet(): Promise<void> {
  try {
    await baseApi.post('/auth/logout');
  } catch {
    // Best effort
  }
  setAuthToken(null);
  localStorage.removeItem(STORAGE_USER_KEY);
  localStorage.removeItem(STORAGE_EMAIL_KEY);
  localStorage.removeItem(STORAGE_SUB_KEY);
  localStorage.removeItem(STORAGE_ADDR_KEY);
  localStorage.removeItem(STORAGE_SALT_KEY);
  localStorage.removeItem(STORAGE_JWT_KEY);
  sessionStorage.removeItem('kibo_lines');
}

// ─── Gas Sponsoring Transaction Execution ─────────────────────────────────

export interface SponsorResponse {
  signature: string;
  sponsorAddress: string;
}

/**
 * Signs and executes a transaction block gaslessly by requesting gas sponsoring
 * from the Kibo backend.
 */
export async function executeSponsoredTransaction(
  wallet: AgentWallet,
  tx: Transaction
): Promise<string> {
  if (!wallet.keypair) {
    throw new Error('Wallet private key is required to sign transactions');
  }

  // 1. Build the transaction block
  tx.setSender(wallet.address);
  
  // Build the transaction bytes
  const txBytes = await tx.build({ client: suiClient });
  const txBytesHex = Buffer.from(txBytes).toString('hex');

  // 2. Request gas sponsoring from the Kibo backend
  const sponsorResp = await baseApi.post('/transfers/sponsor', { txBytes: txBytesHex });
  const sponsorData = sponsorResp.data as SponsorResponse;
  
  if (!sponsorData || !sponsorData.signature) {
    throw new Error('Failed to obtain gas sponsorship from backend relayer');
  }

  // 3. Sign transaction bytes locally using user's private key
  const userSig = await wallet.keypair.signTransaction(txBytes);

  // 4. Submit the transaction block with both user and sponsor signatures
  const submitResult = await suiClient.executeTransactionBlock({
    transactionBlock: txBytes,
    signature: [userSig.signature, sponsorData.signature],
    options: {
      showEffects: true,
      showEvents: true,
    },
  });

  if (submitResult.effects?.status?.status !== 'success') {
    const errorMsg = submitResult.effects?.status?.error || 'Transaction execution failed';
    throw new Error(errorMsg);
  }

  return submitResult.digest;
}

