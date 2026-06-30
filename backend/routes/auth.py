from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from database.db import get_database
from services import credentials as cred_service
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


class UserSync(BaseModel):
    firebase_uid: str
    email: str
    role: str = "public"  # public or admin (workers use worker-auth)
    name: str = Field(default="User", min_length=1)
    state: Optional[str] = None
    city: Optional[str] = None
    ward: Optional[str] = None
    street: Optional[str] = None
    village: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None

    class Config:
        extra = "allow"


def _public_profile(doc: dict) -> dict:
    out = {**doc, "_id": str(doc["_id"]), "role": "public"}
    out.pop("password_hash", None)
    return out


def _admin_profile(doc: dict) -> dict:
    out = {**doc, "_id": str(doc["_id"]), "role": "admin"}
    out.pop("password_hash", None)
    return out


async def _email_used_in_other_collection(db, email_norm: str, allowed: str):
    """Return role name if email belongs to a different account type."""
    if allowed != "worker" and await db.workers.find_one({"email": email_norm}):
        return "worker"
    if allowed != "admin" and await db.admins.find_one({"email": email_norm}):
        return "admin"
    if allowed != "public" and await db.users.find_one({"email": email_norm}):
        return "public"
    return None


@router.post("/sync")
async def sync_user(data: UserSync):
    try:
        db = await get_database()
        email_norm = data.email.strip().lower()
        target_role = data.role or "public"

        if target_role == "worker":
            raise HTTPException(
                status_code=403,
                detail="Workers must register and sign in via the Worker portal.",
            )

        conflict = await _email_used_in_other_collection(db, email_norm, target_role)
        if conflict:
            raise HTTPException(
                status_code=403,
                detail=f"Access Denied: This account is registered as {conflict.upper()}. You cannot log in via the {target_role.upper()} portal.",
            )

        if target_role == "admin":
            admin_doc = await db.admins.find_one({
                "$or": [
                    {"firebase_uid": data.firebase_uid},
                    {"email": email_norm},
                ]
            })
            if not admin_doc:
                raise HTTPException(
                    status_code=403,
                    detail="Access Denied: Administrative accounts cannot be created dynamically.",
                )

            admin_data = {
                "firebase_uid": data.firebase_uid,
                "email": email_norm,
                "name": data.name or "Admin",
                "updated_at": datetime.utcnow(),
            }
            for field in ("state", "city", "ward", "street", "village", "phone", "address"):
                val = getattr(data, field, None)
                if val:
                    admin_data[field] = val

            await db.admins.update_one(
                {"firebase_uid": data.firebase_uid},
                {"$set": admin_data},
                upsert=False,
            )
            await cred_service.upsert_firebase_credentials(
                db, "admin", data.firebase_uid, email_norm, data.firebase_uid
            )
            admin = await db.admins.find_one({"firebase_uid": data.firebase_uid})
            logger.info(f"Admin synced: {data.firebase_uid}")
            return _admin_profile(admin)

        # Public citizen account -> users collection only
        user_data = {
            "firebase_uid": data.firebase_uid,
            "email": email_norm,
            "name": data.name or "User",
            "updated_at": datetime.utcnow(),
        }
        for field in ("state", "city", "ward", "street", "village", "phone", "address"):
            val = getattr(data, field, None)
            if val:
                user_data[field] = val

        await db.users.update_one(
            {"firebase_uid": data.firebase_uid},
            {"$set": user_data},
            upsert=True,
        )
        await cred_service.upsert_firebase_credentials(
            db, "public", data.firebase_uid, email_norm, data.firebase_uid
        )

        user = await db.users.find_one({"firebase_uid": data.firebase_uid})
        logger.info(f"Public user synced: {data.firebase_uid}")
        if user:
            return _public_profile(user)
        return {"message": "Identity Synchronized", "status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Auth sync error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(e)}")


@router.get("/{firebase_uid}")
async def get_user_profile(firebase_uid: str):
    try:
        db = await get_database()
        user = await db.users.find_one({"firebase_uid": firebase_uid})
        if user:
            return _public_profile(user)

        admin = await db.admins.find_one({"firebase_uid": firebase_uid})
        if admin:
            return _admin_profile(admin)

        logger.warning(f"User not found: {firebase_uid}")
        raise HTTPException(status_code=404, detail="Identity Profile not found in Secure Vault.")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get user error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch user: {str(e)}")
