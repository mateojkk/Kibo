import os
from pathlib import Path
from dotenv import load_dotenv

ROOT_ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(ROOT_ENV_PATH)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
JWT_SECRET = os.getenv("JWT_SECRET")
if JWT_SECRET and len(JWT_SECRET) < 32:
    raise ValueError("JWT_SECRET must be at least 32 characters long")
JWT_TTL_SECONDS = int(os.getenv("JWT_TTL_SECONDS", "86400"))
JWT_REFRESH_TTL_SECONDS = int(os.getenv("JWT_REFRESH_TTL_SECONDS", "2592000"))
ENABLE_DIAGNOSTIC_ENDPOINT = os.getenv("ENABLE_DIAGNOSTIC_ENDPOINT", "").lower() in {"1", "true", "yes"}
TRUST_PROXY_HEADERS = os.getenv("TRUST_PROXY_HEADERS", os.getenv("VERCEL", "")).lower() in {"1", "true", "yes"}

FRONTEND_BASE_URL = os.getenv("FRONTEND_BASE_URL", "")
if not FRONTEND_BASE_URL:
    vercel_url = os.getenv("VERCEL_URL")
    if vercel_url:
        FRONTEND_BASE_URL = "https://kibo.vercel.app"
    else:
        FRONTEND_BASE_URL = "http://localhost:5173"

# Support comma-separated origins in the env var
FRONTEND_ORIGINS: list[str] = [
    o.strip() for o in FRONTEND_BASE_URL.split(",") if o.strip()
]

SUI_RPC_URL = os.getenv("SUI_RPC_URL", "https://fullnode.testnet.sui.io:443")
PORT = int(os.getenv("PORT", "8080"))

# Sponsoring keys
import secrets
SPONSOR_PRIVATE_KEY = os.getenv("SPONSOR_PRIVATE_KEY") or secrets.token_hex(32)

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
