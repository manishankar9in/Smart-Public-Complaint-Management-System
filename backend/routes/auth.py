from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field, EmailStr
from typing import Optional
from datetime import datetime, timedelta
from config import settings
from database.db import get_database
from services import credentials as cred_service
import jwt
import secrets
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
        existing_user = await db.users.find_one({"email": email_norm})

        extra_data = data.dict()
        is_google = extra_data.get("auth_provider") == "google.com"
        is_new_user = existing_user is None
        is_registration = extra_data.get("is_registration", False)
        is_login = extra_data.get("is_login", False)

        # ALL users start unverified. Preserve existing verified status for returning users.
        if existing_user:
            email_verified_status = existing_user.get("email_verified", False)
        else:
            email_verified_status = False  # New user — always unverified regardless of provider

        user_data = {
            "firebase_uid": data.firebase_uid,
            "email": email_norm,
            "name": data.name or (existing_user.get("name") if existing_user else "User"),
            "email_verified": email_verified_status,
            "auth_provider": "google.com" if is_google else "password",
            "updated_at": datetime.utcnow(),
        }
        for field in ("state", "city", "ward", "street", "village", "phone", "address"):
            val = getattr(data, field, None)
            if val:
                user_data[field] = val

        # Always upsert matching ONLY {"email": email_norm} to guarantee zero duplicate documents
        await db.users.update_one(
            {"email": email_norm},
            {"$set": user_data, "$setOnInsert": {"created_at": datetime.utcnow()}},
            upsert=True,
        )
        await cred_service.upsert_firebase_credentials(
            db, "public", data.firebase_uid, email_norm, data.firebase_uid
        )

        # For NEW Google users: automatically send a verification email (same as email/password flow)
        if is_new_user and is_google and not is_registration:
            from services.email_service import send_citizen_verification_email, smtp_configured
            verify_token = secrets.token_urlsafe(32)
            verify_expires = datetime.utcnow() + timedelta(hours=24)
            name = user_data.get("name") or email_norm.split("@")[0]
            await cred_service.set_public_email_verify_token(
                db, data.firebase_uid, email_norm, verify_token, verify_expires
            )
            verify_link = f"{settings.FRONTEND_URL.rstrip('/')}/verify-citizen-email?token={verify_token}"
            if smtp_configured():
                send_citizen_verification_email(to_email=email_norm, name=name, verify_link=verify_link)
                logger.info("Sent verification email to new Google user: %s", email_norm)
            else:
                logger.warning("SMTP not configured — verification email NOT sent to new Google user: %s", email_norm)

        user = await db.users.find_one({"email": email_norm})
        logger.info(f"Public user synced: {data.firebase_uid} (verified: {email_verified_status}, google: {is_google}, new: {is_new_user})")

        # Block ALL unverified login attempts — including Google users
        if is_login and not email_verified_status:
            raise HTTPException(
                status_code=403,
                detail="EMAIL_NOT_VERIFIED: Please check your email inbox and click the verification link before signing in.",
            )

        if user:
            return _public_profile(user)
        return {"message": "Identity Synchronized", "status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Auth sync error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(e)}")




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


# ─────────────────────────────────────────────────────────────────────────────
# CITIZEN EMAIL VERIFICATION (via Brevo SMTP – replaces Firebase's unreliable mailer)
# ─────────────────────────────────────────────────────────────────────────────

class CitizenVerifyRequest(BaseModel):
    firebase_uid: str
    email: EmailStr
    name: str = "Citizen"


class CitizenResendRequest(BaseModel):
    email: EmailStr


@router.post("/send-verification")
async def send_citizen_verification(body: CitizenVerifyRequest):
    """
    Called right after Firebase createUserWithEmailAndPassword.
    Generates a secure token, stores it in MongoDB, and sends the link via Brevo SMTP.
    """
    from services.email_service import send_citizen_verification_email, smtp_configured

    db = await get_database()
    email_norm = body.email.strip().lower()

    # Generate a secure 32-byte token (valid 24 hours)
    token = secrets.token_urlsafe(32)
    expires = datetime.utcnow() + timedelta(hours=24)

    await cred_service.set_public_email_verify_token(
        db, body.firebase_uid, email_norm, token, expires
    )

    verify_link = f"{settings.FRONTEND_URL.rstrip('/')}/verify-citizen-email?token={token}"
    name = body.name.strip() or email_norm.split("@")[0]

    email_sent = False
    if smtp_configured():
        email_sent = send_citizen_verification_email(
            to_email=email_norm,
            name=name,
            verify_link=verify_link,
        )
        if not email_sent:
            logger.warning("Citizen verification email failed for %s", email_norm)
    else:
        logger.warning("SMTP not configured — exposing verify link in response for local testing.")

    response: dict = {
        "status": "verification_email_sent",
        "email": email_norm,
        "message": "Verification email sent! Please check your inbox and click the link to activate your account.",
    }
    return response


@router.post("/resend-citizen-verification")
async def resend_citizen_verification(body: CitizenResendRequest):
    """Allow a citizen to request a fresh verification link by email."""
    from services.email_service import send_citizen_verification_email, smtp_configured

    db = await get_database()
    email_norm = body.email.strip().lower()

    # Find the user record
    user = await db.users.find_one({"email": email_norm})
    if not user:
        # Don't reveal whether the account exists
        return {"message": "If this email is registered, a verification link has been sent."}

    if user.get("email_verified"):
        raise HTTPException(status_code=400, detail="This account is already verified.")

    firebase_uid = user.get("firebase_uid", "")
    token = secrets.token_urlsafe(32)
    expires = datetime.utcnow() + timedelta(hours=24)
    name = user.get("name") or email_norm.split("@")[0]

    await cred_service.set_public_email_verify_token(db, firebase_uid, email_norm, token, expires)

    verify_link = f"{settings.FRONTEND_URL.rstrip('/')}/verify-citizen-email?token={token}"

    if smtp_configured():
        send_citizen_verification_email(to_email=email_norm, name=name, verify_link=verify_link)

    return {"message": "If this email is registered, a verification link has been sent."}


@router.get("/verify-email")
async def verify_citizen_email(token: str, request: Request = None):
    """
    Clicked from the verification email link.
    Validates token, marks user as email_verified in MongoDB.
    Returns JSON for SPA API calls, HTML for direct browser visits.
    """
    db = await get_database()
    now = datetime.utcnow()

    record = await cred_service.find_public_by_email_verify_token(db, token)
    if not record:
        # Check if caller already verified this token (idempotent for React StrictMode / double clicks)
        already = await db.email_verify_tokens.find_one({
            "account_type": cred_service.ACCOUNT_PUBLIC,
            "last_used_verify_token": token,
        })
        if already:
            wants_json = request and "application/json" in (request.headers.get("accept", ""))
            if wants_json:
                return {"status": "already_verified", "email": already.get("email", ""), "message": "Email verified successfully. You can now sign in."}
            return HTMLResponse(content=_verification_html(
                "✅ Email Verified!",
                f"Your SmartGov account (<b>{already.get('email', '')}</b>) has been successfully verified. You can now sign in.",
                success=True,
                login_url=f"{settings.FRONTEND_URL}/login?role=public&verified=1",
            ))

        wants_json = request and "application/json" in (request.headers.get("accept", ""))
        if wants_json:
            raise HTTPException(status_code=400, detail="This verification link is invalid or has already been used.")
        return HTMLResponse(content=_verification_html("❌ Invalid Link", "This verification link is invalid or has already been used.", success=False), status_code=400)

    if record.get("email_verify_expires") and record["email_verify_expires"] < now:
        wants_json = request and "application/json" in (request.headers.get("accept", ""))
        if wants_json:
            raise HTTPException(status_code=400, detail="This verification link has expired. Please register again or request a new link.")
        return HTMLResponse(content=_verification_html("⏰ Link Expired", "This verification link has expired. Please register again or request a new link.", success=False), status_code=400)

    firebase_uid = record["firebase_uid"]
    email_norm = record.get("email", "")

    # Mark the user as verified in MongoDB users collection
    await db.users.update_one(
        {"$or": [{"firebase_uid": firebase_uid}, {"email": email_norm}]},
        {"$set": {"email_verified": True, "updated_at": now}},
    )

    # Clean up the token and record usage
    await cred_service.clear_public_email_verify_token(db, firebase_uid, used_token=token)

    logger.info("Citizen email verified: %s (%s)", email_norm, firebase_uid)

    wants_json = request and "application/json" in (request.headers.get("accept", ""))
    if wants_json:
        return {"status": "verified", "email": email_norm, "message": "Email verified successfully. You can now sign in."}

    return HTMLResponse(content=_verification_html(
        "✅ Email Verified!",
        f"Your SmartGov account (<b>{email_norm}</b>) has been successfully verified. You can now sign in.",
        success=True,
        login_url=f"{settings.FRONTEND_URL}/login?role=public&verified=1&email={email_norm}",
    ))


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


class VerifyResetEmailRequest(BaseModel):
    email: EmailStr
    role: str  # "public" or "worker"


@router.post("/verify-reset-email")
async def verify_reset_email(body: VerifyResetEmailRequest):
    """
    Validates that an email belongs to the correct role before a Firebase
    password-reset email is sent from the frontend.
    Returns 200 OK if valid.
    Returns 400 if the email belongs to a different role.
    Returns 404 if the email is not registered at all.
    """
    db = await get_database()
    email_norm = body.email.strip().lower()
    role = body.role.strip().lower()

    if role == "public":
        # Email must be in users collection, not workers
        in_users = await db.users.find_one({"email": email_norm})
        in_workers = await db.workers.find_one({"email": email_norm})
        if in_workers:
            raise HTTPException(
                status_code=400,
                detail=(
                    "This email is registered as a Field Worker account. "
                    "Please use the Worker Forgot Password portal to reset your password."
                ),
            )
        if not in_users:
            raise HTTPException(
                status_code=404,
                detail="No Citizen account found with this email address. Please check the email or register.",
            )
        return {"status": "ok", "message": "Citizen email verified. Proceeding to send reset link."}

    elif role == "worker":
        # Email must be in workers collection, not users
        in_workers = await db.workers.find_one({"email": email_norm})
        in_users = await db.users.find_one({"email": email_norm})
        if in_users:
            raise HTTPException(
                status_code=400,
                detail=(
                    "This email is registered as a Citizen account. "
                    "Please use the Citizen Forgot Password portal to reset your password."
                ),
            )
        if not in_workers:
            raise HTTPException(
                status_code=404,
                detail="No Worker account found with this email address. Please check the email or contact your administrator.",
            )
        return {"status": "ok", "message": "Worker email verified. Proceeding to send reset link."}

    else:
        raise HTTPException(status_code=400, detail="Invalid role. Must be 'public' or 'worker'.")


def _verification_html(title: str, message: str, success: bool, login_url: str = "") -> str:
    color = "#16a34a" if success else "#dc2626"
    btn = f'<a href="{login_url}" style="background:#16a34a;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;margin-top:20px;">Go to Login →</a>' if login_url else ""
    return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title} — SmartGov</title></head>
<body style="margin:0;padding:40px 20px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:40px;text-align:center;border:1px solid #e2e8f0;box-shadow:0 4px 20px rgba(0,0,0,0.06);">
    <div style="font-size:48px;margin-bottom:16px;">{'✅' if success else '❌'}</div>
    <h1 style="color:{color};font-size:22px;margin:0 0 12px;">{title}</h1>
    <p style="color:#475569;font-size:15px;line-height:1.7;margin:0;">{message}</p>
    {btn}
    <p style="color:#94a3b8;font-size:12px;margin-top:32px;">🏛️ SmartGov — Smart Public Complaint Priority and Response System</p>
  </div>
</body>
</html>"""

