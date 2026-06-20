import os
import hashlib
import requests
import base64
from typing import Optional, List, Dict, Any
from cryptography.hazmat.primitives.asymmetric import ed25519

# Default to Sui Testnet
SUI_RPC_URL = os.getenv("SUI_RPC_URL", "https://fullnode.testnet.sui.io:443")
SPONSOR_PRIVATE_KEY_HEX = os.getenv("SPONSOR_PRIVATE_KEY", "")

def rpc_call(method: str, params: list) -> dict:
    """Helper to perform standard JSON-RPC calls to the Sui fullnode."""
    try:
        resp = requests.post(
            SUI_RPC_URL,
            json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params},
            timeout=15,
        )
        resp.raise_for_status()
        payload = resp.json()
        if "error" in payload:
            raise RuntimeError(payload["error"])
        return payload.get("result", {})
    except Exception as e:
        print(f"[sui_client] RPC error calling {method}: {e}")
        return {}

def get_sui_balance(address: str, coin_type: str = "0x2::sui::SUI") -> float:
    """Get balance of coin_type for address, converted to float units."""
    result = rpc_call("suix_getBalance", [address, coin_type])
    if not result:
        return 0.0
    
    total_balance = int(result.get("totalBalance", 0))
    # Standard SUI has 9 decimals, stablecoins typically have 6 or 9.
    # We will fetch coin metadata to get correct decimals if needed, or fallback.
    decimals = 9
    if "usdc" in coin_type.lower() or "usdt" in coin_type.lower() or "usd" in coin_type.lower():
        decimals = 6 # Typical stablecoin decimals on Sui
        
    return total_balance / (10 ** decimals)

def get_coin_balances(address: str) -> Dict[str, float]:
    """Get balances of all tokens for address."""
    result = rpc_call("suix_getAllBalances", [address])
    balances = {}
    if not result:
        return balances
        
    for balance_item in result:
        coin_type = balance_item.get("coinType", "")
        total_balance = int(balance_item.get("totalBalance", 0))
        
        # Determine decimals
        symbol = coin_type.split("::")[-1].upper()
        decimals = 9
        if "USDC" in symbol or "USD" in symbol or "USDT" in symbol:
            decimals = 6
            
        balances[coin_type] = total_balance / (10 ** decimals)
    return balances

def query_address_transactions(address: str, limit: int = 15) -> List[Dict[str, Any]]:
    """Query recent transactions for a Sui address."""
    # We query transaction blocks that involve the address as sender or recipient
    query = {
        "filter": {
            "FromOrToAddress": address
        }
    }
    options = {
        "showInput": True,
        "showEffects": True,
        "showEvents": True,
        "showBalanceChanges": True
    }
    
    result = rpc_call("suix_queryTransactionBlocks", [query, None, limit, True])
    tx_list = []
    if not result or "data" not in result:
        return tx_list
        
    for item in result["data"]:
        digest = item.get("digest", "")
        transaction = item.get("transaction", {})
        data = transaction.get("data", {})
        sender = data.get("sender", "")
        effects = item.get("effects", {})
        status = effects.get("status", {}).get("status", "success")
        
        # Calculate timestamp (Sui stores checkpoint timestamp in ms)
        timestamp_ms = int(item.get("timestampMs", 0))
        timestamp_iso = ""
        if timestamp_ms > 0:
            from datetime import datetime, timezone
            timestamp_iso = datetime.fromtimestamp(timestamp_ms / 1000.0, tz=timezone.utc).isoformat().replace("+00:00", "Z")
            
        # Parse balance changes to detect net amount shifted
        balance_changes = item.get("balanceChanges", [])
        amount_usd = 0.0
        amount_sui = 0.0
        direction = "in"
        
        for change in balance_changes:
            owner = change.get("owner", {})
            owner_address = owner.get("AddressOwner", "")
            if owner_address.lower() == address.lower():
                coin_type = change.get("coinType", "")
                amount = int(change.get("amount", 0))
                symbol = coin_type.split("::")[-1].upper()
                decimals = 6 if "USD" in symbol else 9
                val = amount / (10 ** decimals)
                if "USD" in symbol:
                    amount_usd += val
                else:
                    amount_sui += val
                    
        # Determine transaction direction
        if sender.lower() == address.lower():
            direction = "out"
            
        # Find main amount for display
        final_amount = amount_usd if amount_usd != 0 else amount_sui
        # Keep positive for display
        final_amount = abs(final_amount)
        
        tx_list.append({
            "digest": digest,
            "sender": sender,
            "status": status,
            "direction": direction,
            "amount": final_amount,
            "timestamp": timestamp_iso,
        })
        
    return tx_list

def sponsor_transaction(tx_bytes_hex: str) -> Optional[Dict[str, str]]:
    """
    Signs the Sui transaction bytes as a gas sponsor.
    Returns: { "signature": <base64_encoded_sponsor_sig>, "sponsorAddress": <sponsor_address> }
    """
    if not SPONSOR_PRIVATE_KEY_HEX:
        print("[sui_client] Warning: SPONSOR_PRIVATE_KEY is not set. Sponsoring is disabled.")
        return None
        
    try:
        # Load the sponsor key
        raw_key = SPONSOR_PRIVATE_KEY_HEX.strip()
        if raw_key.startswith("0x"):
            raw_key = raw_key[2:]
            
        # If it's a base64 key, decode it
        try:
            seed_bytes = base64.b64decode(raw_key)
            if len(seed_bytes) != 32:
                seed_bytes = bytes.fromhex(raw_key)
        except Exception:
            seed_bytes = bytes.fromhex(raw_key)
            
        if len(seed_bytes) != 32:
            raise ValueError(f"Sponsor private key must be 32 bytes (got {len(seed_bytes)})")
            
        private_key = ed25519.Ed25519PrivateKey.from_private_bytes(seed_bytes)
        public_key_bytes = private_key.public_key().public_bytes_raw()
        
        # Calculate sponsor's address: sha3_256(0x00 || public_key)
        # In python, we can use hashlib.sha3_256
        h = hashlib.sha3_256()
        h.update(b"\x00" + public_key_bytes)
        sponsor_address = "0x" + h.hexdigest()
        
        # Prepare transaction bytes
        tx_data = bytes.fromhex(tx_bytes_hex.replace("0x", ""))
        
        # Sui signs messages wrapped in intents: [1, 0, 0] prefix for transaction data
        # Intent: Scope (0x01 = TransactionData), Version (0x00), AppId (0x00)
        intent_message = b"\x01\x00\x00" + tx_data
        
        # Hash with Blake2b-256 (32 bytes)
        blake_hash = hashlib.blake2b(intent_message, digest_size=32).digest()
        
        # Sign the hash
        raw_sig = private_key.sign(blake_hash)
        
        # Format Sui serialized signature:
        # ed25519 flag (0x00) + signature (64 bytes) + public key (32 bytes)
        serialized_sig = b"\x00" + raw_sig + public_key_bytes
        
        # Base64 encode the signature
        base64_sig = base64.b64encode(serialized_sig).decode("utf-8")
        
        return {
            "signature": base64_sig,
            "sponsorAddress": sponsor_address
        }
    except Exception as e:
        print(f"[sui_client] Error signing sponsored transaction: {e}")
        return None
