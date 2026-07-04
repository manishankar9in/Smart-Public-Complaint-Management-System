"""Worker accounts: profile in workers collection, credentials in login_credentials (JWT, no Firebase)."""
import logging
import secrets
from datetime import datetime, timedelta
from typing import Optional

import bcrypt
import jwt
from jwt.exceptions import InvalidTokenError
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr, Field

from config import settings
from database.db import get_database
from services.email_service import send_worker_password_reset_email, smtp_configured
from services import credentials as cred_service

logger = logging.getLogger(__name__)
router = APIRouter()
security = HTTPBearer(auto_error=False)

RESET_TOKEN_HOURS = 1

DUTY_POSITIONS = [
    "Electricity",
    "Water",
    "Road",
    "Hospital",
    "Women Safety",
    "Ration",
    "Panchayat",
    "Other",
]


def _hash_password(raw: str) -> str:
    return bcrypt.hashpw(raw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _verify_password(raw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(raw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_worker_token(worker_id: str) -> str:
    exp = datetime.utcnow() + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    payload = {"sub": worker_id, "role": "worker", "exp": exp}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_worker_token(token: str) -> dict:
    return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])


async def get_worker_uid_from_token(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> str:
    if not credentials or not credentials.credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = decode_worker_token(credentials.credentials)
        if payload.get("role") != "worker":
            raise HTTPException(status_code=403, detail="Invalid token role")
        return str(payload["sub"])
    except InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


class WorkerRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=1)
    duty_position: str
    state: str
    city: str
    ward: Optional[str] = None
    street: Optional[str] = None
    village: Optional[str] = None
    phone: Optional[str] = None


class WorkerLogin(BaseModel):
    email: EmailStr
    password: str


class WorkerForgotPassword(BaseModel):
    email: EmailStr


class WorkerResetPassword(BaseModel):
    token: str = Field(min_length=10)
    new_password: str = Field(min_length=6)


def _serialize_worker(doc: dict) -> dict:
    wid = str(doc["_id"])
    return {
        "worker_uid": doc.get("worker_uid") or wid,
        "email": doc.get("email"),
        "name": doc.get("name"),
        "role": "worker",
        "duty_position": doc.get("duty_position"),
        "state": doc.get("state"),
        "city": doc.get("city"),
        "ward": doc.get("ward"),
        "street": doc.get("street"),
        "village": doc.get("village"),
        "phone": doc.get("phone"),
        "department": doc.get("department"),
        "complaints_solved": doc.get("complaints_solved", 0),
    }


async def _ensure_worker_email_available(db, email_norm: str):
    if await db.workers.find_one({"email": email_norm}):
        raise HTTPException(status_code=400, detail="Email already registered for worker access")
    if await db.users.find_one({"email": email_norm}):
        raise HTTPException(status_code=400, detail="Email already registered as a public user")
    if await db.admins.find_one({"email": email_norm}):
        raise HTTPException(status_code=400, detail="Email already registered as an admin")
    conflict = await cred_service.email_exists_in_credentials(db, email_norm)
    if conflict:
        raise HTTPException(status_code=400, detail=f"Email already registered as {conflict}")


@router.post("/register")
async def register_worker(body: WorkerRegister):
    if not body.duty_position or not body.duty_position.strip():
        raise HTTPException(
            status_code=400,
            detail="duty_position is required and cannot be empty",
        )
    db = await get_database()
    email_norm = body.email.strip().lower()
    await _ensure_worker_email_available(db, email_norm)

    doc = {
        "email": email_norm,
        "name": body.name.strip(),
        "duty_position": body.duty_position,
        "state": body.state,
        "city": body.city,
        "ward": body.ward,
        "street": body.street,
        "village": body.village,
        "phone": body.phone,
        "complaints_solved": 0,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    result = await db.workers.insert_one(doc)
    worker_uid = str(result.inserted_id)
    await db.workers.update_one(
        {"_id": result.inserted_id},
        {"$set": {"worker_uid": worker_uid}},
    )

    await cred_service.create_worker_credentials(
        db, worker_uid, email_norm, _hash_password(body.password)
    )

    token = create_worker_token(worker_uid)
    doc["_id"] = result.inserted_id
    doc["worker_uid"] = worker_uid
    return {
        "access_token": token,
        "token_type": "bearer",
        "worker": _serialize_worker(doc),
    }


@router.post("/login")
async def login_worker(body: WorkerLogin):
    db = await get_database()
    email_norm = body.email.strip().lower()
    cred = await cred_service.get_worker_credentials(db, email_norm)
    if not cred or not _verify_password(body.password, cred.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    worker_uid = cred["account_id"]
    try:
        doc = await db.workers.find_one({"_id": ObjectId(worker_uid)})
    except Exception:
        doc = None
    if not doc:
        raise HTTPException(status_code=404, detail="Worker profile not found")

    token = create_worker_token(worker_uid)
    return {
        "access_token": token,
        "token_type": "bearer",
        "worker": _serialize_worker(doc),
    }


@router.get("/me")
async def worker_me(worker_uid: str = Depends(get_worker_uid_from_token)):
    db = await get_database()
    try:
        oid = ObjectId(worker_uid)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid worker id")
    doc = await db.workers.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Worker not found")
    return _serialize_worker(doc)


@router.get("/duty-options")
async def duty_options():
    return {"duty_positions": DUTY_POSITIONS}


@router.post("/forgot-password")
async def worker_forgot_password(body: WorkerForgotPassword):
    """Send password reset link to worker's registered email."""
    db = await get_database()
    email_norm = body.email.strip().lower()
    cred = await cred_service.get_worker_credentials(db, email_norm)
    doc = None
    if cred:
        try:
            doc = await db.workers.find_one({"_id": ObjectId(cred["account_id"])})
        except Exception:
            doc = None

    reset_link = None
    email_sent = False
    if doc and cred:
        token = secrets.token_urlsafe(32)
        expires = datetime.utcnow() + timedelta(hours=RESET_TOKEN_HOURS)
        await cred_service.set_worker_reset_token(db, cred["account_id"], token, expires)
        reset_link = f"{settings.FRONTEND_URL.rstrip('/')}/worker-reset-password?token={token}"

        if smtp_configured():
            email_sent = send_worker_password_reset_email(
                to_email=email_norm,
                name=doc.get("name") or "Worker",
                reset_link=reset_link,
            )
            if not email_sent:
                logger.warning(
                    "Worker password reset email failed for %s; returning reset link in response.",
                    email_norm,
                )
        else:
            logger.warning(
                "SMTP not configured for worker password reset; exposing reset link in API response for local testing."
            )

    response = {
        "message": "If this email is registered as a worker, a password reset link has been sent.",
    }
    if reset_link and (not smtp_configured() or not email_sent):
        response["reset_link"] = reset_link
    return response


@router.post("/reset-password")
async def worker_reset_password(body: WorkerResetPassword):
    """Reset worker password using token from email link."""
    db = await get_database()
    now = datetime.utcnow()
    cred = await cred_service.find_worker_by_reset_token(db, body.token)
    if not cred or cred.get("password_reset_expires", datetime.min) <= now:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link. Please request a new one.")

    await cred_service.update_worker_password(db, cred["account_id"], _hash_password(body.new_password))
    await cred_service.clear_worker_reset_token(db, cred["account_id"])
    return {"message": "Password updated successfully. You can now sign in with your new password."}
