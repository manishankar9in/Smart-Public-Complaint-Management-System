"""Worker accounts: profile in workers collection, credentials in login_credentials (JWT, no Firebase)."""
import logging
import secrets
from datetime import datetime, timedelta
from typing import Optional

import bcrypt
import jwt
from jwt.exceptions import InvalidTokenError
from bson import ObjectId
from pymongo.errors import DuplicateKeyError
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr, Field

from config import settings
from database.db import get_database
from services.email_service import send_worker_password_reset_email, send_worker_verification_email, smtp_configured
from services import credentials as cred_service

from services.category_mapping import DUTY_TO_DEPARTMENT, category_to_department

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

DEPARTMENTS = [
    "Public Works",
    "Water Board",
    "Electricity",
    "Health Dept",
    "Police Dept",
    "Ration Dept",
    "Municipal Maintenance",
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
    duty_position: Optional[str] = None
    department: Optional[str] = None
    available: Optional[bool] = True
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    state: Optional[str] = None
    city: Optional[str] = None
    ward: Optional[str] = None
    street: Optional[str] = None
    village: Optional[str] = None
    phone: Optional[str] = None


class WorkerLogin(BaseModel):
    email: EmailStr
    password: str


class WorkerGoogleLogin(BaseModel):
    firebase_uid: str
    email: EmailStr
    name: Optional[str] = "Worker"


class WorkerForgotPassword(BaseModel):
    email: EmailStr


class WorkerResetPassword(BaseModel):
    token: str = Field(min_length=10)
    new_password: str = Field(min_length=6)


class WorkerAvailabilityUpdate(BaseModel):
    available: bool


class WorkerLocationUpdate(BaseModel):
    latitude: float
    longitude: float


def _serialize_worker(doc: dict) -> dict:
    wid = str(doc["_id"])
    dept = doc.get("department") or "Public Works"
    return {
        "worker_uid": doc.get("worker_uid") or wid,
        "email": doc.get("email"),
        "name": doc.get("name"),
        "role": "worker",
        "department": dept,
        "available": doc.get("available", True),
        "latitude": doc.get("latitude"),
        "longitude": doc.get("longitude"),
        "state": doc.get("state"),
        "city": doc.get("city"),
        "ward": doc.get("ward"),
        "street": doc.get("street"),
        "village": doc.get("village"),
        "phone": doc.get("phone"),
        "complaints_solved": doc.get("complaints_solved", 0),
    }


async def _ensure_worker_email_available(db, email_norm: str):
    if await db.workers.find_one({"email": email_norm}):
        raise HTTPException(status_code=400, detail="This email is already registered as a Field Worker.")
    if await db.users.find_one({"email": email_norm}):
        raise HTTPException(status_code=400, detail="Access Denied: This email is already registered as a Citizen account. The same email cannot be used for Worker registration.")
    if await db.admins.find_one({"email": email_norm}):
        raise HTTPException(status_code=400, detail="Access Denied: This email is already registered as an Admin account. The same email cannot be used for Worker registration.")
    conflict = await cred_service.email_exists_in_credentials(db, email_norm)
    if conflict:
        raise HTTPException(status_code=400, detail=f"Access Denied: This email is already registered as {conflict.upper()}.")


@router.post("/register")
async def register_worker(body: WorkerRegister):
    dept = (body.department or DUTY_TO_DEPARTMENT.get(body.duty_position, "")).strip()
    if not dept:
        raise HTTPException(
            status_code=400,
            detail="department is required and cannot be empty",
        )
    db = await get_database()
    email_norm = body.email.strip().lower()
    await _ensure_worker_email_available(db, email_norm)

    doc = {
        "email": email_norm,
        "name": body.name.strip(),
        "department": dept,
        "available": body.available if body.available is not None else True,
        "latitude": body.latitude,
        "longitude": body.longitude,
        "state": body.state,
        "city": body.city,
        "ward": body.ward,
        "street": body.street,
        "village": body.village,
        "phone": body.phone,
        "complaints_solved": 0,
        "email_verified": False,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    try:
        result = await db.workers.insert_one(doc)
        worker_uid = str(result.inserted_id)
        await db.workers.update_one(
            {"_id": result.inserted_id},
            {"$set": {"worker_uid": worker_uid}},
        )

        await cred_service.create_worker_credentials(
            db, worker_uid, email_norm, _hash_password(body.password)
        )

        # Generate email verification token (valid 24 hours)
        verify_token = secrets.token_urlsafe(32)
        verify_expires = datetime.utcnow() + timedelta(hours=24)
        await cred_service.set_worker_email_verify_token(db, worker_uid, verify_token, verify_expires)

        verify_link = f"{settings.FRONTEND_URL.rstrip('/')}/verify-worker-email?token={verify_token}"

        email_sent = False
        if smtp_configured():
            name = body.name.strip() or email_norm.split("@")[0]
            email_sent = send_worker_verification_email(
                to_email=email_norm,
                name=name,
                verify_link=verify_link,
            )
            if not email_sent:
                logger.warning("Worker verification email failed for %s — returning link in response.", email_norm)
        else:
            logger.warning("SMTP not configured — exposing worker verify link in response for local testing.")

        response = {
            "status": "verification_email_sent",
            "email": email_norm,
            "message": "Registration successful! Please check your email and click the verification link to activate your account.",
        }
        return response

    except DuplicateKeyError as dup_err:
        logger.warning(f"Duplicate key error during worker registration: {dup_err}")
        err_msg = str(dup_err)
        if "email" in err_msg:
            raise HTTPException(status_code=400, detail="This email is already registered.")
        raise HTTPException(
            status_code=400,
            detail="A worker record with these unique details already exists in the system."
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Unexpected error during worker registration: {exc}", exc_info=True)
        raise HTTPException(status_code=400, detail=f"Registration failed: {str(exc)}")


@router.get("/verify-email")
async def verify_worker_email(token: str):
    """Verify worker email address from the link sent during registration."""
    db = await get_database()
    now = datetime.utcnow()
    cred = await cred_service.find_worker_by_email_verify_token(db, token)
    if not cred:
        # Check if this token was already verified (idempotent for React StrictMode, double clicks, refreshes)
        already_used = await db.login_credentials.find_one({
            "account_type": cred_service.ACCOUNT_WORKER,
            "last_used_verify_token": token,
        })
        if already_used:
            return {
                "status": "already_verified",
                "message": "Email verified successfully! You can now sign in to your Worker account.",
            }
        raise HTTPException(status_code=400, detail="Invalid or expired verification link. Please register again or contact support.")
    if cred.get("email_verify_expires", datetime.min) <= now:
        raise HTTPException(status_code=400, detail="This verification link has expired (valid for 24 hours). Please request a new one.")

    worker_id = cred["account_id"]
    # Mark worker as email-verified in workers collection
    try:
        result = await db.workers.update_one(
            {"_id": ObjectId(worker_id)},
            {"$set": {"email_verified": True, "updated_at": datetime.utcnow()}},
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Worker account not found.")
    except Exception as e:
        logger.error(f"Failed to mark worker verified: {e}")
        raise HTTPException(status_code=500, detail="Could not verify account. Please try again.")

    await cred_service.clear_worker_email_verify_token(db, worker_id, used_token=token)
    return {
        "status": "verified",
        "message": "Email verified successfully! You can now sign in to your Worker account.",
    }


class ResendVerifyRequest(BaseModel):
    email: EmailStr


@router.post("/resend-verification")
async def resend_worker_verification(body: ResendVerifyRequest):
    """Resend verification email to unverified worker."""
    db = await get_database()
    email_norm = body.email.strip().lower()

    worker = await db.workers.find_one({"email": email_norm})
    if not worker:
        raise HTTPException(status_code=404, detail="No worker account found with this email.")

    if worker.get("email_verified") is True:
        return {
            "status": "already_verified",
            "message": "This worker account is already verified. You can log in directly.",
        }

    worker_uid = str(worker["_id"])
    verify_token = secrets.token_urlsafe(32)
    verify_expires = datetime.utcnow() + timedelta(hours=24)
    await cred_service.set_worker_email_verify_token(db, worker_uid, verify_token, verify_expires)

    verify_link = f"{settings.FRONTEND_URL.rstrip('/')}/verify-worker-email?token={verify_token}"

    email_sent = False
    if smtp_configured():
        name = worker.get("name", "").strip() or email_norm.split("@")[0]
        email_sent = send_worker_verification_email(
            to_email=email_norm,
            name=name,
            verify_link=verify_link,
        )

    response = {
        "status": "verification_email_sent",
        "email": email_norm,
        "message": "A new verification link has been sent to your email.",
    }
    return response


@router.post("/login")
async def login_worker(body: WorkerLogin):
    db = await get_database()
    email_norm = body.email.strip().lower()

    # Check cross-role email collision
    if await db.users.find_one({"email": email_norm}):
        raise HTTPException(
            status_code=403,
            detail="Access Denied: This email is registered as a Citizen account. Please use the Citizen/User Login portal.",
        )
    if await db.admins.find_one({"email": email_norm}):
        raise HTTPException(
            status_code=403,
            detail="Access Denied: This email is registered as an Admin account. Please use the Admin Login portal.",
        )

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

    # Block login if email is not verified
    # (existing workers without the field are allowed — only new registrations require verification)
    if doc.get("email_verified") is False:
        raise HTTPException(
            status_code=403,
            detail="EMAIL_NOT_VERIFIED: Please check your email inbox and click the verification link before signing in.",
        )

    token = create_worker_token(worker_uid)
    return {
        "access_token": token,
        "token_type": "bearer",
        "worker": _serialize_worker(doc),
    }


@router.post("/google-login")
async def google_login_worker(body: WorkerGoogleLogin):
    """Allow field workers to sign in with Google."""
    db = await get_database()
    email_norm = body.email.strip().lower()

    # Cross-role collision check
    if await db.users.find_one({"email": email_norm}):
        raise HTTPException(
            status_code=403,
            detail="Access Denied: This email is registered as a Citizen account. You cannot sign in as a Field Worker with this email.",
        )
    if await db.admins.find_one({"email": email_norm}):
        raise HTTPException(
            status_code=403,
            detail="Access Denied: This email is registered as an Admin account. Please use the Admin Login portal.",
        )

    worker_doc = await db.workers.find_one({"email": email_norm})
    if not worker_doc:
        raise HTTPException(
            status_code=404,
            detail="No Field Worker profile found for this Google email. Please register as a Worker first with your assigned duty category and jurisdiction.",
        )

    # Block login if worker email is not verified
    if worker_doc.get("email_verified") is False:
        raise HTTPException(
            status_code=403,
            detail="EMAIL_NOT_VERIFIED: Please check your email inbox and click the verification link before signing in with Google.",
        )

    worker_uid = str(worker_doc["_id"])
    await db.workers.update_one(
        {"_id": worker_doc["_id"]},
        {"$set": {"firebase_uid": body.firebase_uid, "updated_at": datetime.utcnow()}},
    )
    await cred_service.upsert_firebase_credentials(
        db, cred_service.ACCOUNT_WORKER, worker_uid, email_norm, body.firebase_uid
    )

    token = create_worker_token(worker_uid)
    return {
        "access_token": token,
        "token_type": "bearer",
        "worker": _serialize_worker(worker_doc),
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
    return {"departments": DEPARTMENTS, "duty_positions": DEPARTMENTS}


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


@router.put("/availability")
async def update_worker_availability(
    body: WorkerAvailabilityUpdate,
    worker_uid: str = Depends(get_worker_uid_from_token),
):
    """Toggle current field worker availability (available: true/false)."""
    db = await get_database()
    try:
        oid = ObjectId(worker_uid)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid worker id")
    result = await db.workers.update_one(
        {"_id": oid},
        {"$set": {"available": body.available, "updated_at": datetime.utcnow()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Worker not found")
    return {"message": f"Availability updated to {'Available' if body.available else 'Unavailable'}", "available": body.available}


@router.put("/location")
async def update_worker_location(
    body: WorkerLocationUpdate,
    worker_uid: str = Depends(get_worker_uid_from_token),
):
    """Update current field worker GPS coordinates (latitude, longitude)."""
    db = await get_database()
    try:
        oid = ObjectId(worker_uid)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid worker id")
    result = await db.workers.update_one(
        {"_id": oid},
        {"$set": {"latitude": body.latitude, "longitude": body.longitude, "updated_at": datetime.utcnow()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Worker not found")
    return {"message": "Location updated successfully", "latitude": body.latitude, "longitude": body.longitude}


@router.get("/departments")
async def get_departments_list():
    return {"departments": DEPARTMENTS}
