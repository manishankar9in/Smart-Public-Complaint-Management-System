from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, timedelta
from config import settings
from database.db import get_database
from services import credentials as cred_service
import jwt
from jwt.exceptions import InvalidTokenError
import logging
import bcrypt

logger = logging.getLogger(__name__)
router = APIRouter()
security = HTTPBearer(auto_error=False)


def _hash_password(raw: str) -> str:
    return bcrypt.hashpw(raw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _verify_password(raw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(raw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_admin_token(admin_id: str) -> str:
    expiry = datetime.utcnow() + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    payload = {"sub": admin_id, "role": "admin", "exp": expiry}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_admin_token(token: str) -> dict:
    return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])


async def get_admin_uid_from_token(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> str:
    if not credentials or not credentials.credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = decode_admin_token(credentials.credentials)
        if payload.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Invalid token role")
        return str(payload.get("sub"))
    except InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


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


class AdminLoginRequest(BaseModel):
    email: str
    password: str


class AdminCreateRequest(BaseModel):
    email: str
    password: str
    name: str
    firebase_uid: str


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


@router.post("/admin-login")
async def admin_login(data: AdminLoginRequest):
    """Separate admin login endpoint - not accessible from public login page."""
    try:
        logger.info(f"Admin login attempt for: {data.email}")
        db = await get_database()
        email_norm = data.email.strip().lower()
        
        logger.info(f"Searching for admin with email: {email_norm}")
        # Find admin by email
        admin = await db.admins.find_one({"email": email_norm})
        if not admin:
            logger.warning(f"Admin login attempt with unknown email: {email_norm}")
            raise HTTPException(
                status_code=401,
                detail="Invalid credentials. Access denied."
            )
        
        logger.info(f"Admin found: {email_norm}")
        # Get password hash
        password_hash = admin.get("password_hash")
        
        if not password_hash:
            logger.error(f"Admin account has no password hash: {email_norm}")
            raise HTTPException(
                status_code=401,
                detail="Admin account is not configured for password login. Please create or update the admin account."
            )
        
        # Verify password
        logger.info(f"Password hash found, verifying password")
        if not _verify_password(data.password, password_hash):
            logger.warning(f"Failed admin login attempt for: {email_norm}")
            raise HTTPException(
                status_code=401,
                detail="Invalid credentials. Access denied."
            )
        
        logger.info(f"Password verified successfully for: {email_norm}")
        token = create_admin_token(admin.get("firebase_uid") or admin.get("email"))
        admin_data = {
            "firebase_uid": admin.get("firebase_uid"),
            "email": admin.get("email"),
            "name": admin.get("name", "Admin"),
            "role": "admin",
            "access_token": token,
            "token_type": "bearer",
        }
        
        logger.info(f"Admin login successful: {email_norm}")
        return admin_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Admin login error: {str(e)}")
        logger.error(f"Error type: {type(e).__name__}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail="Authentication service temporarily unavailable."
        )


@router.get("/admin-me")
async def admin_me(admin_uid: str = Depends(get_admin_uid_from_token)):
    db = await get_database()
    admin = await db.admins.find_one({"firebase_uid": admin_uid})
    if not admin:
        raise HTTPException(status_code=404, detail="Admin profile not found")
    return {
        "firebase_uid": admin.get("firebase_uid"),
        "email": admin.get("email"),
        "name": admin.get("name", "Admin"),
        "role": "admin",
    }


@router.post("/create-admin")
async def create_admin(data: AdminCreateRequest):
    """Create a new admin account (for initial setup only)."""
    try:
        db = await get_database()
        email_norm = data.email.strip().lower()
        
        # Check if admin already exists
        existing = await db.admins.find_one({"email": email_norm})
        if existing:
            raise HTTPException(
                status_code=409,
                detail="Admin with this email already exists."
            )
        
        # Hash password
        password_hash = _hash_password(data.password)
        
        # Create admin document
        admin_data = {
            "email": email_norm,
            "password_hash": password_hash,
            "name": data.name,
            "firebase_uid": data.firebase_uid,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }
        
        result = await db.admins.insert_one(admin_data)
        admin_id = str(result.inserted_id)
        
        logger.info(f"Admin account created: {email_norm}")
        return {
            "message": "Admin account created successfully",
            "admin_id": admin_id,
            "email": email_norm,
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Admin creation error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Failed to create admin account."
        )
