from __future__ import annotations
import os
from typing import Optional
from pathlib import Path
from supabase import create_client, Client

from config import SUPABASE_URL, SUPABASE_KEY, INVITE_CODES_FILE

_client: Optional[Client] = None
DEFAULT_INVITE_CODES_PATH = Path(__file__).resolve().parent.parent / "invite-code.txt"

def get_supabase() -> Client:
    global _client
    if _client is None:
        if not SUPABASE_URL or not SUPABASE_KEY:
            raise RuntimeError("SUPABASE_URL or SUPABASE_KEY is not set")
        _client = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _client

def get_invite_codes_path() -> Path:
    if INVITE_CODES_FILE:
        return Path(INVITE_CODES_FILE).expanduser()
    return DEFAULT_INVITE_CODES_PATH

def seed_invite_codes(supabase: Client) -> None:
    invite_codes_path = get_invite_codes_path()
    if not invite_codes_path.exists():
        return

    codes = [
        line.strip().upper()
        for line in invite_codes_path.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.strip().startswith("#")
    ]
    
    if codes:
        rows = [{"code": c} for c in codes]
        # Ignore duplicates so we don't overwrite used invite codes
        try:
            # We insert and use on_conflict "code" and do nothing
            supabase.table("invite_codes").upsert(rows, ignore_duplicates=True).execute()
        except Exception as e:
            print(f"Failed to seed invite codes: {e}")

def init_db() -> None:
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("CRITICAL: SUPABASE_URL or SUPABASE_KEY is not set.")
        return
    try:
        client = get_supabase()
        seed_invite_codes(client)
        print("Supabase client initialized")
    except Exception as e:
        print(f"ERROR: Could not initialize Supabase: {e}")
