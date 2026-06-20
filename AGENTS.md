# AGENTS.md

## Monorepo structure

- `frontend/` — React + Vite + TypeScript SPA (Kibo app)
- `api/` — FastAPI Python backend
- `sui/kibo/` — Sui Move smart contracts (shielded pool)
- `scripts/` — maintenance scripts (e.g. invite code generator)

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
| Run indexer once | `python api/indexer.py --once` |

The `dev` script waits for the backend to be healthy before starting the frontend. Frontend dev port is 5173, backend is 8080. Vite proxies `/api` to `http://127.0.0.1:8080`.

## Build order

`npm run build` runs `tsc -b && vite build && node postbuild.js` from `frontend/`. Output goes to `dist/` (at repo root, NOT `frontend/dist/`). TypeScript must compile before Vite (enforced by `tsc -b && vite build`).

## Environment

- **`.env` lives at repo root**, loaded by `api/config.py` via `load_dotenv(root .env)`.
- **`frontend/.env`** — no longer required (frontend reads `VITE_*` vars from root `.env` via `envDir: '..'`).
- Vite's `envDir` is set to `..` so frontend reads `VITE_*` vars from root `.env`.
- Required: `MONGODB_URI`, `MONGODB_DB`, `JWT_SECRET` (≥32 chars), `FRONTEND_BASE_URL`.
- Python venv is at `.venv/` in repo root. The backend dev script uses `.venv/bin/python`.
- `.npmrc` sets `legacy-peer-deps=true` (required).

## Critical: @mysten/sui version pin

The frontend uses `@mysten/sui` v**1.x** APIs (`SuiClient`, `Transaction.build({ client })`). The package.json range `^1.21.2` is too loose — v2.x (2.17.0+) **removes `SuiClient`** from `@mysten/sui/client` entirely.

**Do NOT upgrade `@mysten/sui` past 1.x without a full migration.** In v2.x:
- `@mysten/sui/client` no longer exports `SuiClient`. Use `SuiJsonRpcClient` from `@mysten/sui/jsonRpc` instead, and pass `{ url, network: 'testnet' }`.
- Many method signatures changed.

Pin it: `"@mysten/sui": "~1.21.2"` in `frontend/package.json`.

## Backend architecture

- `api/index.py` — FastAPI app, CORS, security headers, error handling, rate limiting (60/min/IP).
- `api/routes.py` — all API routes (auth [zkLogin via Google JWT], contacts, transfers, PIN, spend limits, faucet).
- `api/database.py` — Mongo connection, index setup, invite code seeding on startup.
- `api/middleware.py` — rate limit middleware + address validation.
- `api/sui_client.py` — Sui RPC client with Ed25519 gas sponsoring.
- `api/indexer.py` — polls Sui checkpoints and caches on-chain transfers into Mongo.
- `api/config.py` — loads `.env`, validates config.
- `api/requirements.txt` — real deps; root `requirements.txt` may be stale.

All routes are mounted under `/api` (the prefix is in `api/index.py`, not the route decorators). The `/health` endpoint is at the root (`/health`, NOT `/api/health`).

### Auth flow (Google zkLogin)

- Frontend loads Google Identity Services (GIS) script and calls `google.accounts.id.prompt()`.
- GIS returns a credential (JWT) verified by Google.
- `loginWithGoogle(credential)` parses email from the JWT, fetches a deterministic salt from `/auth/zklogin/salt`, derives Ed25519 keypair locally, then posts to `/auth/zklogin`.
- Backend `/auth/zklogin` verifies the JWT with `google-auth` (or falls back to unverified decode in dev when `GOOGLE_CLIENT_ID` is not set).
- User identity is keyed by `sub` claim from the Google JWT.

## Frontend architecture

- Entry: `frontend/src/main.tsx` → `App.tsx` → `AppShell.tsx`.
- State: `hooks/useAppState.ts` (unified wallet + contacts + balances).
- Wallet: `lib/wallet.ts` (keypair, zkLogin, session restore, gasless transfers).
- Keystore: `lib/keystore.ts` (PBKDF2 + AES-GCM, IndexedDB session keys).
- Crypto: `lib/crypto.ts` (P-256 ECDH for private transfers).
- API: `api.ts` (axios instance with auth token injection).
- Terminal: `lib/terminal/` (step-based flow, command parsing, private/public sends).
- Views: `AuthView`, `HomeView`, `ContactsView`, `SettingsView`, `TransactionsView`.

CSS modules live alongside components (e.g. `home.module.css` next to `HomeView.tsx`). The app uses a dark theme with CSS custom properties defined in `index.css`.

## Move contracts

`sui/kibo/sources/shielded_pool.move` — on-chain shielded pool with deposit/withdraw using Ed25519 signatures and commitment tracking. Tests in `sui/kibo/tests/`. Package published at `KIBO_PACKAGE_ID` / `SHIELDED_POOL_ID` (see `frontend/src/lib/suiChain.ts`).

## Vercel deployment

`vercel.json` builds frontend as static and backend as Python. Routes: `/api/*` → backend, everything else → SPA `index.html`. Build command: `npm run build`. Output: `dist/`. The `postbuild.js` copies `dist/` to `.vercel/output/static` on Vercel.

## Mongo collections

`users`, `contacts`, `activity`, `audit_events`, `invite_codes`, `onchain_transfers`, `indexer_state`, `user_index_states`, `transfer_approvals`, `spend_ledger`.

## Invite codes

Seeded on startup from `INVITE_CODES_FILE` env var or `invite-code.txt`. Generate more: `python3 scripts/generate_invite_codes.py 20 --output invite-code.txt`.
