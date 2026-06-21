# AGENTS.md

## Monorepo structure

- `frontend/` — React + Vite + TypeScript SPA (Kibo app)
- `api/` — FastAPI Python backend
- `sui/kibo/` — Sui Move smart contracts (shielded pool)

## Commands (from repo root)

| Task | Command |
|------|---------|
| Install all | `npm run install:all` |
| Dev (both) | `npm run dev` |
| Frontend only | `npm run dev:frontend` |
| Backend only | `npm run dev:backend` |
| Build (prod) | `npm run build` |
| Frontend tests | `cd frontend && npx vitest run` |
| Frontend lint | `cd frontend && npx eslint .` |
| Frontend typecheck | `cd frontend && npx tsc -b` |
| E2E tests | `cd frontend && npx playwright test` |
| Python sanity | `python3 -m compileall api` |
| Backend tests | `cd api && python -m pytest` |

The `dev` script waits for the backend to be healthy before starting the frontend. Frontend dev port is 5173, backend is 8080. Vite proxies `/api` to `http://127.0.0.1:8080`.

## Build order

`npm run build` runs `tsc -b && vite build && node postbuild.js` from `frontend/`. Output goes to `dist/` (at repo root, NOT `frontend/dist/`). TypeScript must compile before Vite (enforced by `tsc -b && vite build`).

## Environment

- **`.env` lives at repo root**, loaded by `api/config.py` via `load_dotenv`.
- Vite reads `VITE_*` vars from root `.env` via `envDir: '..'` — no `frontend/.env` needed.
- Required: `SUPABASE_URL`, `SUPABASE_KEY`, `JWT_SECRET` (≥32 chars).
- Optional but typical: `SUI_RPC_URL` (defaults to Sui Testnet), `SPONSOR_PRIVATE_KEY` (falls back to random), `GOOGLE_CLIENT_ID` (dev fallback decodes JWT without verifying), `FRONTEND_BASE_URL` (falls back to `http://localhost:5173` or Vercel URL).
- Python venv is at `.venv/` in repo root. The backend dev script uses `.venv/bin/python`.
- `.npmrc` sets `legacy-peer-deps=true` (required).

## Database: Supabase (PostgreSQL)

The backend uses Supabase, **not** MongoDB. The client is initialized in `api/supabase_client.py`. Key tables: `users`, `contacts`, `activity`, `audit_events`, `transfer_approvals`, `spend_ledger`.

(Prior docs referencing MongoDB are stale — trust the code in `api/routes.py` and `api/supabase_client.py`.)

## Critical: @mysten/sui version pin

The frontend uses `@mysten/sui` v**1.x** APIs (`SuiClient`, `Transaction.build({ client })`). The `frontend/package.json` pins `"@mysten/sui": "~1.21.2"`. **Do NOT upgrade past 1.x** — v2.x removes `SuiClient` from `@mysten/sui/client` and changes many method signatures.

## Backend architecture

- `api/index.py` — FastAPI app, CORS, security headers, error handling, global rate limit (60/min/IP).
- `api/routes.py` — all API routes (auth [zkLogin via Google JWT], contacts, transfers, PIN, spend limits, faucet, LLM/Groq).
- `api/supabase_client.py` — Supabase client init (replaces legacy MongoDB).
- `api/middleware.py` — rate limit middleware + Sui address validation.
- `api/sui_client.py` — Sui RPC client with Ed25519 gas sponsoring.
- `api/config.py` — loads `.env`, validates config, sets defaults.
- `api/ratelimit.py` — per-action rate limiter (used in routes for auth, transfers, faucet).
- `api/requirements.txt` — real deps; root `requirements.txt` is stale.

All routes are mounted under `/api` (the prefix is in `api/index.py`, not the route decorators). The `/health` endpoint is at the root (`/health`, NOT `/api/health`).

### Auth flow (Google zkLogin)

- Frontend calls `google.accounts.id.prompt()` via GIS script.
- GIS returns a credential JWT. `loginWithGoogle(credential)` parses email, fetches deterministic HMAC-SHA256 salt from `/auth/zklogin/salt`, derives Ed25519 keypair locally, then posts to `/auth/zklogin`.
- Backend verifies JWT via `google-auth` (or unverified decode in dev when `GOOGLE_CLIENT_ID` is not set).
- User identity is keyed by `sub` claim from the Google JWT.
- Session is persisted to localStorage; restored via `tryRestoreSession()`.

## Frontend architecture

- Entry: `frontend/src/main.tsx` → `App.tsx` → `AppShell.tsx`.
- State: `hooks/useAppState.ts` (unified wallet + contacts + balances).
- Wallet: `lib/wallet.ts` (Ed25519 keypair derivation, zkLogin, session restore, gasless sponsored transactions).
- Crypto: `lib/keystore.ts` (PBKDF2 + AES-GCM, IndexedDB session keys); `lib/crypto.ts` (P-256 ECDH for private transfers).
- API: `api.ts` (axios instance with auth token injection).
- Terminal: `lib/terminal/` (step-based flow, command parsing, private/public sends).
- Views: `AuthView`, `HomeView`, `ContactsView`, `SettingsView`, `TransactionsView`.
- CSS modules alongside components (e.g. `home.module.css` next to `HomeView.tsx`). Dark theme via CSS custom properties in `index.css`.
- Test files in `src/__tests__/`, E2E in `tests/e2e/`.

## Move contracts

`sui/kibo/sources/shielded_pool.move` — on-chain shielded pool with deposit/withdraw using Ed25519 signatures and commitment tracking. Tests in `sui/kibo/tests/kibo_tests.move`. Published package IDs at `frontend/src/lib/suiChain.ts`.

## Vercel deployment

`vercel.json` builds frontend as static (`@vercel/static-build`) and backend as Python (`@vercel/python`). Routes: `/api/*` → backend, everything else → SPA `index.html`. Build command: `npm run build` (from root `package.json`, which runs `cd frontend && npm install && npm run build`). `postbuild.js` copies `dist/` to `.vercel/output/static` on Vercel.

## Registration

Invite-code gating has been removed. Registration is open.
