"""Login credentials stored separately from profile collections (users, workers, admins)."""
from datetime import datetime
from typing import Optional

from bson import ObjectId

ACCOUNT_PUBLIC = "public"
ACCOUNT_WORKER = "worker"
ACCOUNT_ADMIN = "admin"


async def upsert_firebase_credentials(db, account_type: str, account_id: str, email: str, firebase_uid: str):
    """Public/admin auth is via Firebase — store reference only, no password in profile collections."""
    email_norm = email.strip().lower()
    await db.login_credentials.update_one(
        {"account_type": account_type, "account_id": account_id},
        {
            "$set": {
                "account_type": account_type,
                "account_id": account_id,
                "email": email_norm,
                "firebase_uid": firebase_uid,
                "auth_provider": "firebase",
                "updated_at": datetime.utcnow(),
            },
            "$setOnInsert": {"created_at": datetime.utcnow()},
        },
        upsert=True,
    )


async def create_worker_credentials(db, worker_id: str, email: str, password_hash: str):
    email_norm = email.strip().lower()
    await db.login_credentials.insert_one({
        "account_type": ACCOUNT_WORKER,
        "account_id": worker_id,
        "email": email_norm,
        "password_hash": password_hash,
        "auth_provider": "local",
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    })


async def get_worker_credentials(db, email: str) -> Optional[dict]:
    email_norm = email.strip().lower()
    return await db.login_credentials.find_one({
        "account_type": ACCOUNT_WORKER,
        "email": email_norm,
    })


async def get_worker_credentials_by_id(db, worker_id: str) -> Optional[dict]:
    return await db.login_credentials.find_one({
        "account_type": ACCOUNT_WORKER,
        "account_id": worker_id,
    })


async def update_worker_password(db, worker_id: str, password_hash: str):
    await db.login_credentials.update_one(
        {"account_type": ACCOUNT_WORKER, "account_id": worker_id},
        {"$set": {"password_hash": password_hash, "updated_at": datetime.utcnow()}},
    )


async def set_worker_reset_token(db, worker_id: str, token: str, expires: datetime):
    await db.login_credentials.update_one(
        {"account_type": ACCOUNT_WORKER, "account_id": worker_id},
        {
            "$set": {
                "password_reset_token": token,
                "password_reset_expires": expires,
                "updated_at": datetime.utcnow(),
            }
        },
    )


async def find_worker_by_reset_token(db, token: str) -> Optional[dict]:
    return await db.login_credentials.find_one({
        "account_type": ACCOUNT_WORKER,
        "password_reset_token": token,
    })


async def clear_worker_reset_token(db, worker_id: str):
    await db.login_credentials.update_one(
        {"account_type": ACCOUNT_WORKER, "account_id": worker_id},
        {
            "$unset": {"password_reset_token": "", "password_reset_expires": ""},
            "$set": {"updated_at": datetime.utcnow()},
        },
    )


async def email_exists_in_credentials(db, email_norm: str, exclude_type: Optional[str] = None) -> Optional[str]:
    """Return account_type if email is registered in credentials."""
    query = {"email": email_norm}
    if exclude_type:
        query["account_type"] = {"$ne": exclude_type}
    doc = await db.login_credentials.find_one(query)
    return doc.get("account_type") if doc else None
