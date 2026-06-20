from __future__ import annotations
import os
from typing import Optional
from pathlib import Path
from supabase import create_client, Client

from config import SUPABASE_URL, SUPABASE_KEY

_client: Optional[Client] = None
DEFAULT_INVITE_CODES_PATH = Path(__file__).resolve().parent.parent / "invite-code.txt"

def get_supabase() -> Client:
    global _client
    if _client is None:
        if not SUPABASE_URL or not SUPABASE_KEY:
            raise RuntimeError("SUPABASE_URL or SUPABASE_KEY is not set")
        _client = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _client



def init_db() -> None:
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("CRITICAL: SUPABASE_URL or SUPABASE_KEY is not set.")
        return
    try:
        client = get_supabase()
        print("Supabase client initialized")
    except Exception as e:
        print(f"ERROR: Could not initialize Supabase: {e}")
