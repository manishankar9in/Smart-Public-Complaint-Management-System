"""Send transactional emails via SMTP (Gmail-compatible)."""
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from config import settings

logger = logging.getLogger(__name__)


def _smtp_configured() -> bool:
    return bool(settings.SMTP_USER and settings.SMTP_PASSWORD)


def smtp_configured() -> bool:
    return _smtp_configured()


def send_email(*, to_email: str, subject: str, html_body: str, text_body: str = "") -> bool:
    if not _smtp_configured():
        logger.warning("SMTP not configured — email not sent to %s", to_email)
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.SMTP_FROM_EMAIL or settings.SMTP_USER
    msg["To"] = to_email

    if text_body:
        msg.attach(MIMEText(text_body, "plain"))
    msg.attach(MIMEText(html_body, "html"))

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.sendmail(msg["From"], [to_email], msg.as_string())
        logger.info("Email sent to %s: %s", to_email, subject)
        return True
    except Exception as exc:
        logger.error("Failed to send email to %s: %s", to_email, exc)
        return False


def send_worker_password_reset_email(*, to_email: str, name: str, reset_link: str) -> bool:
    subject = "SmartGov — Reset Your Worker Password"
    text_body = (
        f"Hello {name},\n\n"
        f"We received a request to reset your worker account password.\n\n"
        f"Click the link below to set a new password (valid for 1 hour):\n{reset_link}\n\n"
        "If you did not request this, you can safely ignore this email.\n\n"
        "— SmartGov Team"
    )
    html_body = f"""
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;">
      <h2 style="color:#1e3a8a;">SmartGov Worker Portal</h2>
      <p>Hello <strong>{name}</strong>,</p>
      <p>We received a request to reset your worker account password.</p>
      <p style="margin:28px 0;">
        <a href="{reset_link}"
           style="background:#d97706;color:#fff;padding:12px 24px;border-radius:8px;
                  text-decoration:none;font-weight:bold;display:inline-block;">
          Reset Password
        </a>
      </p>
      <p style="font-size:13px;color:#64748b;">This link expires in 1 hour. If you did not request a reset, ignore this email.</p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
      <p style="font-size:12px;color:#94a3b8;">Smart Public Complaint Priority and Response System</p>
    </div>
    """
    return send_email(to_email=to_email, subject=subject, html_body=html_body, text_body=text_body)
