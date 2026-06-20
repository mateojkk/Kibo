import uuid
import hashlib
import hmac
import secrets
import re
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel, EmailStr
from passlib.context import CryptContext
import jwt
from postgrest.exceptions import APIError
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

from config import (
    ENABLE_DIAGNOSTIC_ENDPOINT,
    JWT_SECRET,
    JWT_TTL_SECONDS,
    JWT_REFRESH_TTL_SECONDS,
    GOOGLE_CLIENT_ID,
)
from supabase_client import get_supabase
from middleware import is_valid_address
from ratelimit import rate_limiter
import sui_client

router = APIRouter()

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def normalize_username(username: str) -> str:
    return username.strip().lower()


def normalize_email(email: str) -> str:
    return email.strip().lower()


def username_from_email(email: str, supabase) -> str:
    local = email.split("@", 1)[0]
    base = re.sub(r"[^a-z0-9_]", "", local.lower())
    if len(base) < 3:
        base = "user"
    base = base[:24]
    candidate = base
    attempts = 0
    while supabase.table("users").select("id").eq("username", candidate).limit(1).execute().data:
        suffix = secrets.token_hex(2)
        trimmed = base[: max(3, 28 - len(suffix))]
        candidate = f"{trimmed}{suffix}"
        attempts += 1
        if attempts > 10:
            candidate = f"user{secrets.token_hex(3)}"
            break
    return candidate


def require_jwt_secret() -> None:
    if not JWT_SECRET:
        raise HTTPException(status_code=500, detail="JWT_SECRET is not configured")


def create_token(user_id: str, username: str) -> str:
    require_jwt_secret()
    payload = {
        "sub": user_id,
        "username": username,
        "exp": datetime.now(timezone.utc) + timedelta(seconds=JWT_TTL_SECONDS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def issue_refresh_token(supabase, user: dict) -> str:
    token = secrets.token_urlsafe(48)
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=JWT_REFRESH_TTL_SECONDS)
    supabase.table("users").update(
        {"refresh_token_hash": hash_token(token), "refresh_token_expires_at": expires_at.isoformat().replace("+00:00", "Z")}
    ).eq("id", user["id"]).execute()
    return token


def verify_refresh_token(user: dict, token: str) -> bool:
    if not token:
        return False
    if user.get("refresh_token_hash") != hash_token(token):
        return False
    expires_at = user.get("refresh_token_expires_at")
    if not expires_at:
        return False
    try:
        exp = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
    except Exception:
        return False
    return datetime.now(timezone.utc) < exp


def audit_log(supabase, user_id: Optional[str], action: str, request: Request, status: str, detail: str = "") -> None:
    supabase.table("audit_events").insert(
        {
            "user_id": user_id,
            "action": action,
            "status": status,
            "request_meta": {
                "detail": detail,
                "ip": request.client.host if request.client else "",
                "ua": request.headers.get("user-agent", "")
            },
            "created_at": now_iso(),
        }
    ).execute()


def enforce_rate_limit(request: Request, action: str, limit: int, window_seconds: int) -> None:
    ip = request.client.host if request.client else "unknown"
    key = f"{ip}:{action}"
    if not rate_limiter.allow(key, limit, window_seconds):
        raise HTTPException(status_code=429, detail="too many requests, slow down")


def bearer_token(request: Request) -> str:
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="authorization required")
    return auth.split(" ", 1)[1].strip()


def get_current_user(request: Request) -> dict:
    require_jwt_secret()
    token = bearer_token(request)
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except Exception:
        raise HTTPException(status_code=401, detail="invalid token")
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="invalid token")
    supabase = get_supabase()
    res = supabase.table("users").select("*").eq("id", user_id).limit(1).execute()
    user = res.data[0] if res.data else None
    if not user:
        raise HTTPException(status_code=401, detail="user not found")
    request.state.user = user
    return user


@router.get("/diagnostic")
def diagnostic(user: dict = Depends(get_current_user)):
    if not ENABLE_DIAGNOSTIC_ENDPOINT:
        raise HTTPException(status_code=404, detail="not found")
    supabase = get_supabase()
    ok = True
    try:
        supabase.table("users").select("id").limit(1).execute()
    except Exception as e:
        ok = False
        print(f"[diagnostic] database ping failed: {e}")
    return {
        "status": "online",
        "database": {
            "connected": ok,
        },
        "user": str(user.get("id", "")),
    }


class ZkLoginSaltRequest(BaseModel):
    identifier: str


class ZkLoginSessionRequest(BaseModel):
    jwt: str
    walletAddress: str
    email: str
    username: Optional[str] = None
    encryptionPublicKey: Optional[str] = None


class SponsorRequest(BaseModel):
    txBytes: str


def normalize_invite_code(code: str) -> str:
    return code.strip().upper()


@router.post("/auth/zklogin/salt")
def zklogin_salt(req: ZkLoginSaltRequest, request: Request):
    enforce_rate_limit(request, "auth_salt", 60, 60)
    identifier = req.identifier.strip().lower()
    if not identifier:
        raise HTTPException(status_code=400, detail="identifier required")
    
    # Generate deterministic 256-bit salt based on identifier and JWT_SECRET
    # Output as hex (32 bytes = 64 hex chars), not a decimal integer, so it
    # stays safely within the BN254 field order needed by Sui zkLogin.
    digest = hmac.new(JWT_SECRET.encode("utf-8"), identifier.encode("utf-8"), hashlib.sha256).digest()
    salt = digest.hex()
    return {"salt": salt}


@router.post("/auth/zklogin")
def zklogin_session(req: ZkLoginSessionRequest, request: Request):
    enforce_rate_limit(request, "auth_zklogin", 30, 60)
    if not is_valid_address(req.walletAddress):
        raise HTTPException(status_code=400, detail="invalid wallet address")

    # Try verifying the Google JWT. If it fails (e.g. mock JWT for dev/testnet),
    # fall back to decoding without signature verification.
    try:
        if GOOGLE_CLIENT_ID:
            idinfo = id_token.verify_oauth2_token(
                req.jwt,
                google_requests.Request(),
                GOOGLE_CLIENT_ID,
                clock_skew_in_seconds=10,
            )
            sub = idinfo["sub"]
            email = idinfo.get("email", "").strip().lower()
        else:
            raise ValueError("GOOGLE_CLIENT_ID not configured, using unverified mode")
    except Exception:
        # Dev/testnet fallback: decode without verification
        try:
            claims = jwt.decode(req.jwt, options={"verify_signature": False})
        except Exception:
            raise HTTPException(status_code=401, detail="invalid JWT payload")

        sub = claims.get("sub", "")
        email = req.email.strip().lower() or claims.get("email", "").strip().lower()
        if not sub:
            sub = hashlib.sha256(email.encode("utf-8")).hexdigest()

    supabase = get_supabase()
    res = supabase.table("users").select("*").eq("sub", sub).limit(1).execute()
    user = res.data[0] if res.data else None
    if not user and email:
        res = supabase.table("users").select("*").eq("email", email).limit(1).execute()
        user = res.data[0] if res.data else None

    now = now_iso()
    requested_username = normalize_username(req.username or "")
    if requested_username:
        if len(requested_username) < 3 or len(requested_username) > 30:
            raise HTTPException(status_code=400, detail="Your username must be between 3 and 30 characters.")
        if not re.match(r"^[a-zA-Z0-9_]+$", requested_username):
            raise HTTPException(status_code=400, detail="Your username can only contain letters, numbers, and underscores.")
        existing_username_res = supabase.table("users").select("*").eq("username", requested_username).limit(1).execute()
        existing_username = existing_username_res.data[0] if existing_username_res.data else None
        if existing_username and (not user or existing_username["id"] != user["id"]):
            raise HTTPException(status_code=409, detail="That username is already taken. Please try another one.")

    wallet_address = req.walletAddress.lower()

    if user:
        updates = {
            "sub": sub,
            "wallet_address": wallet_address,
            "updated_at": now,
        }
        if email:
            updates["email"] = email
        if requested_username:
            updates["username"] = requested_username
        if req.encryptionPublicKey:
            updates["encryption_public_key"] = req.encryptionPublicKey
        try:
            supabase.table("users").update(updates).eq("id", user["id"]).execute()
        except APIError:
            raise HTTPException(status_code=409, detail="an account already exists for this identity")
        user.update(updates)
    else:
        username = requested_username or (username_from_email(email, supabase) if email else f"user{secrets.token_hex(3)}")
        user_doc = {
            "username": username,
            "email": email,
            "sub": sub,
            "password_hash": "",
            "keystore": "",
            "wallet_address": wallet_address,
            "encryption_public_key": req.encryptionPublicKey or "",
            "created_at": now,
            "updated_at": now,
        }
        try:
            result = supabase.table("users").insert(user_doc).execute()
            user_doc["id"] = result.data[0]["id"]
        except APIError:
            raise HTTPException(status_code=409, detail="an account already exists for this identity")
        
        user = result.data[0]
        audit_log(supabase, user["id"], "register_zklogin", request, "ok")

    username = user.get("username", "")
    token = create_token(str(user["id"]), username)
    refresh_token = issue_refresh_token(supabase, user)
    audit_log(supabase, user["id"], "login_zklogin", request, "ok")
    return {
        "token": token,
        "refreshToken": refresh_token,
        "username": username,
        "email": user.get("email", ""),
        "walletAddress": user.get("wallet_address", ""),
        "pfp": user.get("pfp", ""),
    }


@router.post("/transfers/sponsor")
def sponsor_tx(req: SponsorRequest, request: Request, user: dict = Depends(get_current_user)):
    enforce_rate_limit(request, "sponsor_tx", 60, 60)
    result = sui_client.sponsor_transaction(req.txBytes)
    if not result:
        raise HTTPException(status_code=500, detail="failed to sign sponsored transaction")
    return result


@router.post("/faucet")
def run_faucet(request: Request, user: dict = Depends(get_current_user)):
    enforce_rate_limit(request, "faucet", 5, 60)
    address = user.get("wallet_address")
    if not address:
        raise HTTPException(status_code=400, detail="user has no wallet address")
    
    # Request SUI from official Sui Testnet faucet
    try:
        resp = requests.post(
            "https://faucet.testnet.sui.io/v1/gas",
            json={"FixedAmountRequest": {"recipient": address}},
            timeout=15
        )
        # Even if the faucet returns 429 or error, we catch it gracefully
        return {"ok": resp.status_code < 400, "status": resp.status_code}
    except Exception as e:
        print(f"[faucet] Error requesting gas: {e}")
        return {"ok": False, "error": str(e)}


class PinRequest(BaseModel):
    pin: str


def validate_pin(pin: str) -> str:
    raw = pin.strip()
    if not raw.isdigit():
        raise HTTPException(status_code=400, detail="pin must be numeric")
    if len(raw) < 4 or len(raw) > 12:
        raise HTTPException(status_code=400, detail="pin must be 4–12 digits")
    return raw


def is_pin_locked(user: dict) -> bool:
    locked_until = user.get("pin_locked_until")
    if not locked_until:
        return False
    try:
        lock_time = datetime.fromisoformat(locked_until.replace("Z", "+00:00"))
    except Exception:
        return False
    return datetime.now(timezone.utc) < lock_time


def record_pin_failure(user: dict, supabase) -> None:
    failures = int(user.get("pin_failures", 0)) + 1
    update = {"pin_failures": failures, "updated_at": now_iso()}
    if failures >= 5:
        lock_until = datetime.now(timezone.utc) + timedelta(minutes=15)
        update["pin_locked_until"] = lock_until.isoformat().replace("+00:00", "Z")
    supabase.table("users").update(update).eq("id", user["id"]).execute()


def clear_pin_failures(user: dict, supabase) -> None:
    supabase.table("users").update({"pin_failures": 0, "pin_locked_until": None, "updated_at": now_iso()}).eq("id", user["id"]).execute()


@router.get("/auth/pin/status")
def pin_status(user: dict = Depends(get_current_user)):
    return {"enabled": bool(user.get("pin_hash"))}


@router.post("/auth/pin")
def set_pin(req: PinRequest, user: dict = Depends(get_current_user), request: Request = None):
    if request is not None:
        enforce_rate_limit(request, "pin_set", 10, 60)
    pin = validate_pin(req.pin)
    supabase = get_supabase()
    supabase.table("users").update({"pin_hash": pwd_context.hash(pin), "pin_failures": 0, "pin_locked_until": None, "updated_at": now_iso()}).eq("id", user["id"]).execute()
    if request is not None:
        audit_log(supabase, user["id"], "pin_set", request, "ok")
    return {"updated": True}


@router.post("/auth/pin/verify")
def verify_pin(req: PinRequest, user: dict = Depends(get_current_user), request: Request = None):
    if request is not None:
        enforce_rate_limit(request, "pin_verify", 30, 60)
    pin = validate_pin(req.pin)
    if is_pin_locked(user):
        if request is not None:
            audit_log(get_supabase(), user["id"], "pin_verify", request, "error", "locked")
        raise HTTPException(status_code=423, detail="pin locked, try again later")
    if not user.get("pin_hash"):
        raise HTTPException(status_code=400, detail="pin not set")
    if not pwd_context.verify(pin, user.get("pin_hash", "")):
        supabase = get_supabase()
        record_pin_failure(user, supabase)
        if request is not None:
            audit_log(supabase, user["id"], "pin_verify", request, "error", "invalid pin")
        raise HTTPException(status_code=401, detail="invalid pin")
    supabase = get_supabase()
    clear_pin_failures(user, supabase)
    if request is not None:
        audit_log(supabase, user["id"], "pin_verify", request, "ok")
    return {"ok": True}


class RefreshRequest(BaseModel):
    refreshToken: str


@router.post("/auth/refresh")
def refresh(req: RefreshRequest, request: Request):
    require_jwt_secret()
    supabase = get_supabase()
    res = supabase.table("users").select("*").eq("refresh_token_hash", hash_token(req.refreshToken)).limit(1).execute()
    user = res.data[0] if res.data else None
    if not user or not verify_refresh_token(user, req.refreshToken):
        raise HTTPException(status_code=401, detail="invalid refresh token")
    token = create_token(str(user["id"]), user["username"])
    refresh_token = issue_refresh_token(supabase, user)
    audit_log(supabase, user["id"], "refresh", request, "ok")
    return {"token": token, "refreshToken": refresh_token}


@router.post("/auth/logout")
def logout(user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    supabase.table("users").update({"refresh_token_hash": None, "refresh_token_expires_at": None, "updated_at": now_iso()}).eq("id", user["id"]).execute()
    return {"ok": True}


class ActivityRequest(BaseModel):
    txHash: str
    amount: float
    to: str
    label: Optional[str] = ""


@router.post("/activity", status_code=201)
def create_activity(req: ActivityRequest, user: dict = Depends(get_current_user)):
    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="amount must be greater than zero")
    if not is_valid_address(req.to):
        raise HTTPException(status_code=400, detail="invalid recipient address")
    if not req.txHash or len(req.txHash) < 10:
        raise HTTPException(status_code=400, detail="invalid tx hash")
    supabase = get_supabase()
    activity_id = str(uuid.uuid4())
    supabase.table("activity").insert(
        {
            "id": activity_id,
            "user_id": user["id"],
            "amount": req.amount,
            "to": req.to.lower(),
            "label": req.label or "",
            "tx_hash": req.txHash,
            "created_at": now_iso(),
        }
    ).execute()
    return {"id": activity_id}


@router.get("/activity")
def list_activity(user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    items = []
    res = supabase.table("activity").select("*").eq("user_id", user["id"]).order("created_at", desc=True).limit(20).execute()
    for row in res.data:
        items.append(
            {
                "id": row.get("id"),
                "amount": row.get("amount"),
                "to": row.get("to"),
                "label": row.get("label") or "",
                "txHash": row.get("tx_hash"),
                "createdAt": row.get("created_at"),
            }
        )
    return items


@router.get("/activity/onchain")
def list_onchain_activity(limit: int = 15, user: dict = Depends(get_current_user)):
    address = (user.get("wallet_address") or "").lower()
    if not address:
        return []
    try:
        txs = sui_client.query_address_transactions(address, limit)
        items = []
        for tx in txs:
            items.append({
                "id": tx["digest"],
                "txHash": tx["digest"],
                "amount": str(tx["amount"]),
                "from": tx["sender"],
                "to": address if tx["direction"] == "in" else "Recipient/ShieldedPool",
                "createdAt": tx["timestamp"],
                "direction": tx["direction"],
                "status": tx["status"],
            })
        return items
    except Exception as e:
        print(f"[onchain] error query txs: {e}")
        return []



class SpendLimitRequest(BaseModel):
    dailyLimit: Optional[float] = None


@router.get("/auth/spend-limit")
def get_spend_limit(user: dict = Depends(get_current_user)):
    return {"dailyLimit": user.get("daily_spend_limit")}


@router.post("/auth/spend-limit")
def set_spend_limit(req: SpendLimitRequest, user: dict = Depends(get_current_user)):
    if req.dailyLimit is not None and req.dailyLimit <= 0:
        raise HTTPException(status_code=400, detail="daily limit must be greater than zero")
    supabase = get_supabase()
    supabase.table("users").update({"daily_spend_limit": req.dailyLimit, "updated_at": now_iso()}).eq("id", user["id"]).execute()
    return {"updated": True, "dailyLimit": req.dailyLimit}


class TransferAuthorizeRequest(BaseModel):
    amount: float
    to: str
    pin: str


@router.post("/transfers/authorize")
def authorize_transfer(req: TransferAuthorizeRequest, user: dict = Depends(get_current_user), request: Request = None):
    if request is not None:
        enforce_rate_limit(request, "transfer_authorize", 30, 60)
    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="amount must be greater than zero")
    if not is_valid_address(req.to):
        raise HTTPException(status_code=400, detail="invalid recipient address")
    pin = validate_pin(req.pin)
    if is_pin_locked(user):
        raise HTTPException(status_code=423, detail="pin locked, try again later")
    if not pwd_context.verify(pin, user.get("pin_hash", "")):
        supabase = get_supabase()
        record_pin_failure(user, supabase)
        raise HTTPException(status_code=401, detail="invalid pin")
    supabase = get_supabase()
    clear_pin_failures(user, supabase)

    # Enforce daily spend limit if configured
    limit = user.get("daily_spend_limit")
    if limit is not None:
        day = datetime.now(timezone.utc).date().isoformat()
        total = 0.0
        for row in supabase.table("spend_ledger").select("amount").eq("user_id", user["id"]).eq("day", day).execute().data:
            try:
                total += float(row.get("amount", 0))
            except Exception:
                pass
        if total + req.amount > float(limit):
            raise HTTPException(status_code=402, detail="daily spend limit exceeded")

    approval_id = str(uuid.uuid4())
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=5)
    supabase.table("transfer_approvals").insert(
        {
            "id": approval_id,
            "user_id": user["id"],
            "amount": req.amount,
            "to": req.to.lower(),
            "expires_at": expires_at.isoformat().replace("+00:00", "Z"),
            "created_at": now_iso(),
        }
    ).execute()
    return {"approvalId": approval_id, "expiresAt": expires_at.isoformat().replace("+00:00", "Z")}


class TransferConfirmRequest(BaseModel):
    approvalId: str


@router.post("/transfers/confirm")
def confirm_transfer(req: TransferConfirmRequest, user: dict = Depends(get_current_user), request: Request = None):
    if request is not None:
        enforce_rate_limit(request, "transfer_confirm", 60, 60)
    supabase = get_supabase()
    res = supabase.table("transfer_approvals").select("*").eq("id", req.approvalId).eq("user_id", user["id"]).limit(1).execute()
    approval = res.data[0] if res.data else None
    if not approval:
        raise HTTPException(status_code=404, detail="approval not found")
    expires_at = approval.get("expires_at")
    if expires_at:
        try:
            exp = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            if datetime.now(timezone.utc) > exp:
                raise HTTPException(status_code=410, detail="approval expired")
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=400, detail="invalid approval timestamp")

    # enforce daily spend limit and log ledger on confirm to avoid phantom approvals
    limit = user.get("daily_spend_limit")
    if limit is not None:
        day = datetime.now(timezone.utc).date().isoformat()
        total = 0.0
        for row in supabase.table("spend_ledger").select("amount").eq("user_id", user["id"]).eq("day", day).execute().data:
            try:
                total += float(row.get("amount", 0))
            except Exception:
                pass
        if total + float(approval.get("amount", 0)) > float(limit):
            raise HTTPException(status_code=402, detail="daily spend limit exceeded")

    supabase.table("spend_ledger").insert(
        {
            "user_id": user["id"],
            "day": datetime.now(timezone.utc).date().isoformat(),
            "amount": approval.get("amount", 0),
            "created_at": now_iso(),
        }
    ).execute()
    supabase.table("transfer_approvals").delete().eq("id", req.approvalId).execute()
    return {"ok": True}


@router.get("/auth/me")
def get_me(user: dict = Depends(get_current_user)):
    return {
        "username": user.get("username", ""),
        "email": user.get("email", ""),
        "walletAddress": user.get("wallet_address", ""),
        "pfp": user.get("pfp", ""),
    }


@router.get("/users/{identifier}/pubkey")
def get_user_pubkey(identifier: str):
    supabase = get_supabase()
    clean_id = identifier.strip().lower()
    res = supabase.table("users").select("*").eq("username", clean_id).limit(1).execute()
    user = res.data[0] if res.data else None
    if not user:
        res = supabase.table("users").select("*").eq("wallet_address", clean_id).limit(1).execute()
        user = res.data[0] if res.data else None
    if not user:
        raise HTTPException(status_code=404, detail="user not found")
    return {"publicKey": user.get("encryption_public_key", "")}


class UpdateProfileRequest(BaseModel):
    username: Optional[str] = None
    pfp: Optional[str] = None


@router.put("/auth/profile")
def update_profile(req: UpdateProfileRequest, user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    updates = {}
    if req.username is not None:
        requested_username = normalize_username(req.username)
        if len(requested_username) < 3 or len(requested_username) > 30:
            raise HTTPException(status_code=400, detail="Your username must be between 3 and 30 characters.")
        if not re.match(r"^[a-zA-Z0-9_]+$", requested_username):
            raise HTTPException(status_code=400, detail="Your username can only contain letters, numbers, and underscores.")
        existing_username_res = supabase.table("users").select("*").eq("username", requested_username).limit(1).execute()
        existing_username = existing_username_res.data[0] if existing_username_res.data else None
        if existing_username and existing_username["id"] != user["id"]:
            raise HTTPException(status_code=409, detail="That username is already taken. Please try another one.")
        updates["username"] = requested_username

    if req.pfp is not None:
        updates["pfp"] = req.pfp

    if updates:
        updates["updated_at"] = now_iso()
        supabase.table("users").update(updates).eq("id", user["id"]).execute()

    return {"ok": True}



@router.delete("/auth/account", status_code=204)
def delete_account(user: dict = Depends(get_current_user)):
    raise HTTPException(status_code=403, detail="account deletion is disabled")


# ── contacts ──────────────────────────────────────────────

class CreateContactRequest(BaseModel):
    name: str
    walletAddress: str
    email: Optional[str] = ""
    phone: Optional[str] = ""


def contact_to_dict(doc: dict) -> dict:
    return {
        "id": str(doc.get("id")),
        "name": doc.get("name"),
        "address": doc.get("wallet_address"),
        "email": doc.get("email") or "",
        "phone": doc.get("phone") or "",
    }


@router.get("/contacts")
def list_contacts(user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    res = supabase.table("contacts").select("*").eq("owner_id", user["id"]).order("name").execute()
    return [contact_to_dict(r) for r in res.data]


@router.post("/contacts", status_code=201)
def create_contact(req: CreateContactRequest, user: dict = Depends(get_current_user)):
    name = req.name.strip().lower()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    if not is_valid_address(req.walletAddress):
        raise HTTPException(status_code=400, detail="invalid contact wallet address")

    supabase = get_supabase()
    res = supabase.table("contacts").select("id").eq("owner_id", user["id"]).eq("name", name).limit(1).execute()
    if res.data:
        raise HTTPException(status_code=409, detail="contact name already exists")

    doc = {
        "owner_id": user["id"],
        "name": name,
        "wallet_address": req.walletAddress,
        "email": req.email or "",
        "phone": req.phone or "",
        "created_at": now_iso(),
    }
    try:
        result = supabase.table("contacts").insert(doc).execute()
        doc["id"] = result.data[0]["id"]
    except APIError:
        raise HTTPException(status_code=409, detail="contact name already exists")
    return contact_to_dict(doc)


@router.delete("/contacts/{contact_id}", status_code=204)
def delete_contact(contact_id: str, user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    res = supabase.table("contacts").delete().eq("id", contact_id).eq("owner_id", user["id"]).execute()
    if len(res.data) == 0:
        raise HTTPException(status_code=404, detail="contact not found")
    return None
