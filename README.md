# Kibo

Internal repo for the Kibo app: private conversational payments built on Sui.

This is a small monorepo:

- [`frontend/`](/home/mateo/kibo/frontend): Vite + React + TypeScript SPA
- [`api/`](/home/mateo/kibo/api): FastAPI Python backend
- [`sui/`](/home/mateo/kibo/sui): Sui Move smart contracts (Shielded Pool)
- [`vercel.json`](/home/mateo/kibo/vercel.json): Vercel routing for frontend + backend

The app currently focuses on:

- **zkLogin** (passwordless, non-custodial wallet generation via Google OAuth)
- **Private Mode** (Shielded Pool conversational transfers)
- **Gasless Transactions** (backend sponsored transactions for smooth UX)
- **Contacts & Activity History**
- **Testnet Integrations** (Native Sui Faucet & Cetus DEX Swaps)
- **Transaction PIN & Spend-limit controls**

## Architecture & Dependencies

### Third-Party Dependencies

- **Sui Blockchain**: Core ledger, zkLogin cryptography, and Gas Sponsoring.
- **Cetus Protocol**: SDK used to route testnet token swaps (SUI -> USDC).
- **Google Identity Services**: OAuth provider used to bootstrap zkLogin keys.

### Infrastructure

- **Sui Testnet RPC**: Network communication, reads, Faucet interactions.
- **Supabase (PostgreSQL)**: App persistence layer, replacing the legacy MongoDB configuration.
- **Vercel**: Deployment runtime for the static frontend and the Python serverless API.

### Custom App Logic

- App shell, views, terminal UI, and dynamic frontend UX.
- Custom zkLogin salt generation server and session management.
- Faucet request proxy and in-app Cetus Swap orchestration.
- Encrypted keystore model for ECDH shared secrets.
- `ShieldedPool` Move smart contract managing private commitments and Ed25519 verifications.

## Repo Layout

```text
.
├── api/                 FastAPI app, Auth, Contacts, Activity, Indexer
├── frontend/            React/Vite app, Wallet Logic, UI, Tests
├── sui/                 Move smart contracts
├── scripts/             Maintenance scripts
├── vercel.json          Vercel config for SPA + /api
├── package.json         Root scripts
└── requirements.txt     Root Python dependency list
```

## Auth / Access Model

- Users sign in using Google OAuth (zkLogin).
- Registration is **open** (invite-code gating has been removed).
- The backend serves a deterministic `salt` required for zkLogin key derivation.

## Security Notes

This repo is private for now and should be treated as internal software.

- Private keys (zkLogin ephemeral keys) are generated and stored exclusively client-side.
- The app is deployed on Testnet and is not positioned as production-grade custody software.
- The backend features tight defaults: raw exceptions are stripped, security headers are injected.

## Local Development

### Requirements

- Node.js 18+
- npm
- Python 3.12.x recommended
- Supabase Project (PostgreSQL)

### Environment Variables

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Supabase API URL |
| `SUPABASE_KEY` | Supabase service_role key |
| `JWT_SECRET` | Backend JWT signing secret |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID for zkLogin |
| `SUI_RPC_URL` | Testnet RPC (e.g. `https://fullnode.testnet.sui.io:443`) |
| `SPONSOR_PRIVATE_KEY` | Hex private key for backend transaction sponsoring |
| `FRONTEND_BASE_URL` | Frontend URL / allowed CORS origins |

### Install

From repo root:

```bash
npm run install:all
```

### Run

Frontend only:

```bash
npm run dev:frontend
```

Backend only:

```bash
npm run dev:backend
```

Both together (waits for backend health before starting frontend):

```bash
npm run dev
```

Default dev ports:
- frontend: `5173`
- backend: `8080` (Vite proxies `/api` to localhost:8080)

## Build & Deploy

The repo is fully configured for a single Vercel project deployment.

To build locally:
```bash
npm run build
```

The `vercel.json` ensures that `/api/*` is routed to the FastAPI backend, and all other routes fall back to the built Vite SPA.

## Testing

Backend syntax check:
```bash
python3 -m compileall api
```

Frontend tests:
```bash
cd frontend
npm test
npm run lint
```
## Post-Hackathon Goals

Building the ultimate chat-first P2P payment experience requires a few more pieces of critical infrastructure that fall just outside the scope of this hackathon:

- **Fiat On-Ramps:** Integrating secure, direct fiat-to-USDC rails (e.g., Stripe Crypto, Coinbase Pay) so users can fund their wallets without touching an external exchange.
- **Payment Requests:** Implementing a robust `request <amount> from <contact>` command that generates shareable payment links and push notifications for seamless cross-border invoicing.
