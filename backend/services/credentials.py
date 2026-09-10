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
        {"account_type": account_type, "email": email_norm},
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


# ──────────────────────────────────────────────
# Worker email verification token helpers
# ──────────────────────────────────────────────

async def set_worker_email_verify_token(db, worker_id: str, token: str, expires: datetime):
    """Store an email verification token against the worker credential record."""
    await db.login_credentials.update_one(
        {"account_type": ACCOUNT_WORKER, "account_id": worker_id},
        {
            "$set": {
                "email_verify_token": token,
                "email_verify_expires": expires,
                "updated_at": datetime.utcnow(),
            }
        },
    )


async def find_worker_by_email_verify_token(db, token: str) -> Optional[dict]:
    """Return credential doc matching an email verification token."""
    return await db.login_credentials.find_one({
        "account_type": ACCOUNT_WORKER,
        "email_verify_token": token,
    })


async def clear_worker_email_verify_token(db, worker_id: str, used_token: Optional[str] = None):
    """Remove the email verification token after it has been used."""
    update_data = {
        "$unset": {"email_verify_token": "", "email_verify_expires": ""},
        "$set": {"updated_at": datetime.utcnow()},
    }
    if used_token:
        update_data["$set"]["last_used_verify_token"] = used_token
        update_data["$set"]["email_verified_at"] = datetime.utcnow()
    await db.login_credentials.update_one(
        {"account_type": ACCOUNT_WORKER, "account_id": worker_id},
        update_data,
    )


# ──────────────────────────────────────────────
# Citizen / Public user email verification token helpers
# ──────────────────────────────────────────────

async def set_public_email_verify_token(db, firebase_uid: str, email: str, token: str, expires: datetime):
    """Store a citizen email verification token in a dedicated collection."""
    await db.email_verify_tokens.update_one(
        {"account_type": ACCOUNT_PUBLIC, "firebase_uid": firebase_uid},
        {
            "$set": {
                "account_type": ACCOUNT_PUBLIC,
                "firebase_uid": firebase_uid,
                "email": email.strip().lower(),
                "email_verify_token": token,
                "email_verify_expires": expires,
                "updated_at": datetime.utcnow(),
            },
            "$setOnInsert": {"created_at": datetime.utcnow()},
        },
        upsert=True,
    )


async def find_public_by_email_verify_token(db, token: str) -> Optional[dict]:
    """Return the token doc matching a citizen verification token."""
    return await db.email_verify_tokens.find_one({
        "account_type": ACCOUNT_PUBLIC,
        "email_verify_token": token,
    })


async def clear_public_email_verify_token(db, firebase_uid: str, used_token: Optional[str] = None):
    """Remove the citizen email verification token after it has been used."""
    if used_token:
        await db.email_verify_tokens.update_one(
            {"account_type": ACCOUNT_PUBLIC, "firebase_uid": firebase_uid},
            {
                "$unset": {"email_verify_token": "", "email_verify_expires": ""},
                "$set": {
                    "last_used_verify_token": used_token,
                    "email_verified_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow(),
                },
            },
        )
    else:
        await db.email_verify_tokens.delete_one({
            "account_type": ACCOUNT_PUBLIC,
            "firebase_uid": firebase_uid,
        })
