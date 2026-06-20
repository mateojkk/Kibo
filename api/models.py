from typing import Optional
from pydantic import BaseModel


class CreateContactRequest(BaseModel):
    ownerWallet: str
    name: str
    walletAddress: str
    email: Optional[str] = ""
    phone: Optional[str] = ""
