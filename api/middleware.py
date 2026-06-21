"""Middleware and helpers for rate limiting and validation."""
import time
import re
from collections import defaultdict
from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from config import TRUST_PROXY_HEADERS

# ── Address validation ──────────────────────────────────────
SUI_ADDRESS_RE = re.compile(r"^0x[0-9a-fA-F]{1,64}$")


def is_valid_address(addr: str) -> bool:
    """Check if a string is a valid Sui hex address."""
    return bool(SUI_ADDRESS_RE.match(addr.strip()))


def get_client_ip(request: Request) -> str:
    if TRUST_PROXY_HEADERS:
        vercel_forwarded = request.headers.get("x-vercel-forwarded-for", "").strip()
        if vercel_forwarded:
            return vercel_forwarded.split(",")[0].strip()
        forwarded = request.headers.get("x-forwarded-for", "").strip()
        if forwarded:
            return forwarded.split(",")[0].strip()
        real_ip = request.headers.get("x-real-ip", "").strip()
        if real_ip:
            return real_ip
    return request.client.host if request.client else "unknown"


# ── Rate limiter ────────────────────────────────────────────
class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Simple sliding-window rate limiter.
    Limits each IP to `max_requests` per `window_seconds`.
    In serverless (Vercel), the window resets on cold starts,
    but still prevents burst abuse within a single instance.
    """

    def __init__(self, app, max_requests: int = 60, window_seconds: int = 60):
        super().__init__(app)
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.requests: dict[str, list[float]] = defaultdict(list)

    async def dispatch(self, request: Request, call_next):
        client_ip = get_client_ip(request)
        now = time.time()
        cutoff = now - self.window_seconds

        # Prune old entries
        recent = [t for t in self.requests[client_ip] if t > cutoff]
        self.requests[client_ip] = recent

        if len(recent) >= self.max_requests:
            raise HTTPException(
                status_code=429,
                detail="rate limit exceeded — try again later",
            )

        self.requests[client_ip].append(now)
        return await call_next(request)
