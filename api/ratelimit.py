from __future__ import annotations

import time
from typing import Dict, Tuple

class RateLimiter:
    def __init__(self) -> None:
        self._buckets: Dict[str, Tuple[int, float]] = {}

    def allow(self, key: str, limit: int, window_seconds: int) -> bool:


        now = time.time()
        count, reset_at = self._buckets.get(key, (0, now + window_seconds))
        if now > reset_at:
            count, reset_at = 0, now + window_seconds
        if count >= limit:
            self._buckets[key] = (count, reset_at)
            return False
        self._buckets[key] = (count + 1, reset_at)
        return True


rate_limiter = RateLimiter()
