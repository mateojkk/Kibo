import sys
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from starlette.responses import JSONResponse

# Add the current directory to sys.path to allow importing siblings
sys.path.insert(0, os.path.dirname(__file__))

from config import PORT, FRONTEND_BASE_URL, FRONTEND_ORIGINS
from supabase_client import init_db
from routes import router
from middleware import RateLimitMiddleware

# Initialize database globally to ensure it runs immediately on cold starts
try:
    init_db()
except Exception as e:
    print(f"CRITICAL: Failed to initialize database: {e}")

app = FastAPI(title="kibo", version="1.0.0")

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    import traceback
    error_type = type(exc).__name__
    error_msg = str(exc)
    print(f"ERROR [{error_type}]: {error_msg}")
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"detail": "internal server error"},
        headers={"Access-Control-Allow-Origin": FRONTEND_ORIGINS[0] if FRONTEND_ORIGINS else "*"},
    )

# Handle CORS via standard middleware below

# Restrict CORS for security
origins = list(FRONTEND_ORIGINS) + [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault(
        "Content-Security-Policy",
        "default-src 'self'; "
        "img-src 'self' data: https:; "
        "style-src 'self' 'unsafe-inline'; "
        "script-src 'self' https://accounts.google.com https://apis.google.com; "
        "frame-src 'self' https://accounts.google.com; "
        "connect-src 'self' https://fullnode.testnet.sui.io:443 https://prover.mystenlabs.com https://*.sui.io https://accounts.google.com https://*.google.com https://www.googleapis.com;"
    )
    return response

# Rate limiting: 60 requests per minute per IP
app.add_middleware(RateLimitMiddleware, max_requests=60, window_seconds=60)

# We include the router WITH the /api prefix so it matches /api/* on Vercel.
app.include_router(router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    print(f"server listening on :{PORT}")
    uvicorn.run("index:app", host="0.0.0.0", port=PORT, reload=True)
