"""
Email Management and Testing Router for Smart Public Complaint Management System.
Provides safe health check and test email dispatch endpoints.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr
from typing import Optional

from services.email_service import get_email_health, send_test_email, smtp_configured

router = APIRouter()


class EmailTestRequest(BaseModel):
    email: EmailStr


@router.get("/health")
async def email_health():
    """Safe email health check returning public config status without exposing secrets."""
    return get_email_health()


@router.post("/test")
async def email_test(body: EmailTestRequest):
    """
    Protected development/test endpoint to test Brevo SMTP delivery independently.
    """
    if not smtp_configured():
        raise HTTPException(
            status_code=503,
            detail="SMTP is not configured on this server. Check SMTP_USERNAME / SMTP_PASSWORD in backend/.env",
        )

    res = send_test_email(to_email=body.email)
    if not res.get("success"):
        return {
            "success": False,
            "message": res.get("message", "Email sending failed"),
            "error": res.get("error", "Unknown SMTP error"),
        }

    return {
        "success": True,
        "message": "Test email sent successfully",
        "recipient": body.email,
    }
