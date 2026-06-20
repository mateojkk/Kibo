import type { AgentWallet } from './wallet';
import { baseApi } from '../api';

export type ActivityItem = {
  id: string;
  amount: number;
  from?: string;
  to: string;
  label: string;
  txHash: string;
  createdAt: string;
  direction?: 'in' | 'out';
};

const STORAGE_KEY = 'kibo_activity';
const SNAPSHOT_KEY = 'kibo_activity_snapshot';
const MAX_ITEMS = 20;
const DEFAULT_LIMIT = 10;

export function loadActivity(walletAddress: string): ActivityItem[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}_${walletAddress}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadSnapshot(walletAddress: string): ActivityItem[] {
  try {
    const raw = sessionStorage.getItem(`${SNAPSHOT_KEY}_${walletAddress}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveSnapshot(walletAddress: string, items: ActivityItem[]) {
  try {
    sessionStorage.setItem(`${SNAPSHOT_KEY}_${walletAddress}`, JSON.stringify(items.slice(0, MAX_ITEMS)));
  } catch {
    // Ignore snapshot write issues.
  }
}

export function loadCachedActivity(walletAddress: string): ActivityItem[] {
  const local = loadActivity(walletAddress);
  if (local.length > 0) return local;
  return loadSnapshot(walletAddress);
}

function shortAddr(addr: string) {
  if (!addr) return '';
  if (addr.startsWith('0x') && addr.length === 42) {
    return `0x${addr.slice(2, 4)}…${addr.slice(-2)}`;
  }
  return addr.length > 8 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

type FetchActivityOptions = {
  limit?: number;
  offset?: number;
};

export async function fetchActivity(wallet?: AgentWallet, options: FetchActivityOptions = {}): Promise<ActivityItem[]> {
  try {
    if (!wallet) return [];
    const snapshot = loadSnapshot(wallet.address);
    const limit = options.limit ?? DEFAULT_LIMIT;
    const offset = options.offset ?? 0;
    const [activityResult, onchainResult] = await Promise.allSettled([
      baseApi.get<ActivityItem[]>('/activity', { params: { limit, offset } }),
      baseApi.get<ActivityItem[]>('/activity/onchain', { params: { limit, offset } }),
    ]);

    const recorded = (activityResult.status === 'fulfilled' ? activityResult.value.data : []).map((item) => ({
      ...item,
      amount: Number(item.amount),
      direction: item.direction ?? 'out',
      label: item.label || shortAddr(item.to ?? ''),
    }));

    const onchain = (onchainResult.status === 'fulfilled' ? onchainResult.value.data : []).map((item) => {
      const from = item.from ?? '';
      const to = item.to ?? '';
      const incoming = item.direction === 'in';
      const counterparty = incoming ? from : to;
      return {
        ...item,
        amount: Number(item.amount),
        label: item.label || shortAddr(counterparty),
      };
    });

    const merged = [...recorded, ...onchain];
    const local = loadActivity(wallet.address);
    if (merged.length === 0) {
      return local.length > 0 ? local : snapshot;
    }
    const seen = new Set<string>();
    const deduped = [...merged, ...local].filter((item) => {
      const key = item.txHash || item.id;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const sorted = deduped.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    if (sorted.length > 0) {
      saveSnapshot(wallet.address, sorted);
    }
    return sorted;
  } catch {
    if (!wallet) return [];
    const local = loadActivity(wallet.address);
    return local.length > 0 ? local : loadSnapshot(wallet.address);
  }
}

export async function recordActivity(walletAddress: string, item: Omit<ActivityItem, 'id' | 'createdAt'>) {
  const entry: ActivityItem = {
    ...item,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  try {
    await baseApi.post('/activity', {
      txHash: entry.txHash,
      amount: entry.amount,
      to: entry.to,
      label: entry.label,
    });
  } catch {
    // Keep local fallback if the API write fails.
  }
  const next = [entry, ...loadActivity(walletAddress)].slice(0, MAX_ITEMS);
  localStorage.setItem(`${STORAGE_KEY}_${walletAddress}`, JSON.stringify(next));
  saveSnapshot(walletAddress, next);
  window.dispatchEvent(new Event('kibo-activity'));
}
