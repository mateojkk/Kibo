/**
 * Shared API helpers: axios instance with wallet auth header + address validation.
 */
import axios from 'axios';

/** Sui address regex: 0x + 64 hex chars */
const SUI_RE = /^0x[0-9a-fA-F]{64}$/;
const AUTH_TOKEN_KEY = 'kibo_auth_token';

export function isValidAddress(addr: string): boolean {
  return SUI_RE.test(addr);
}

/**
 * Base URL for the API. 
 * Defaulting to '/api' allows the frontend and backend to work together 
 * automatically when deployed as a single Vercel project.
 */
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

if (!import.meta.env.VITE_API_URL && import.meta.env.PROD) {
  console.info("[api] project is using relative '/api' path. ensure your deployment routes /api to the backend.");
}

/**
 * Standard axios instance for non-authenticated calls
 */
export function setAuthToken(token: string | null): void {
  if (token) {
    sessionStorage.setItem(AUTH_TOKEN_KEY, token);
  } else {
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
  }
}

export function getAuthToken(): string | null {
  return sessionStorage.getItem(AUTH_TOKEN_KEY);
}

export const baseApi = axios.create({
  baseURL: API_BASE_URL
});

baseApi.interceptors.request.use((config) => {
  const token = getAuthToken();
  const headers = config.headers as any;
  const existingAuthorization = typeof headers?.get === 'function'
    ? headers.get('Authorization')
    : headers?.Authorization ?? headers?.authorization;

  if (token && !existingAuthorization) {
    config.headers = headers || {};
    if (typeof (config.headers as any).set === 'function') {
      (config.headers as any).set('Authorization', `Bearer ${token}`);
    } else {
      (config.headers as any).Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

/**
 * Create an axios instance that injects the X-Wallet-Address header
 * for authenticated requests.
 */
export function authAxios(walletAddress: string | undefined) {
  const instance = axios.create({
    baseURL: API_BASE_URL
  });
  if (walletAddress) {
    instance.defaults.headers.common['X-Wallet-Address'] = walletAddress;
  }
  return instance;
}

/**
 * Helper to get a clean error message from axios
 */
export function getErrorMessage(err: any): string {
  if (err.response?.data?.detail) {
    if (typeof err.response.data.detail === 'string') return err.response.data.detail;
    if (Array.isArray(err.response.data.detail)) return err.response.data.detail[0]?.msg || 'validation error';
  }
  if (err.response?.status === 404) return "resource not found (404) - check your routing/vercel.json";
  if (err.response?.status === 401) return "unauthorized (401) - login or create a wallet";
  if (err.response?.status === 500) return `server error (500): ${err.response?.data?.message || err.response?.data || 'unknown'}`;
  if (typeof err.response?.data === 'string' && err.response.data.startsWith('<!DOCTYPE')) {
    return "received HTML instead of JSON (likely Vercel 404 page) - check routing";
  }
  if (err.message === 'Network Error') {
    return "Network Error: Check if backend is online and CORS is enabled if using a separate domain.";
  }
  return err.message || 'unknown error';
}
