"""
Brevo SMTP Email Service for Smart Public Complaint Management System.
Handles transactional emails with STARTTLS, structured logging, safe error diagnostics,
email notification tracking, and Indian Standard Time (IST, UTC+5:30) date formatting.
"""

import asyncio
import json
import logging
import smtplib
import socket
import urllib.error
import urllib.request
from datetime import datetime, timezone, timedelta
from email.header import Header
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr
from typing import Any, Dict, Optional

from config import settings

logger = logging.getLogger("email_service")

# Indian Standard Time (IST) offset: UTC + 5 hours 30 minutes
IST = timezone(timedelta(hours=5, minutes=30))


def get_ist_now() -> datetime:
    """Return current datetime in Indian Standard Time (IST)."""
    return datetime.now(timezone.utc).astimezone(IST)


def format_ist_datetime(dt: Optional[datetime] = None, fmt: str = "%d-%m-%Y %I:%M %p IST") -> str:
    """
    Format a datetime object to Indian Standard Time (IST).
    Handles naive UTC datetimes safely.
    """
    if dt is None:
        dt = datetime.now(timezone.utc)
    elif dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    ist_dt = dt.astimezone(IST)
    return ist_dt.strftime(fmt)


def brevo_api_configured() -> bool:
    """Return True if Brevo REST API key is configured."""
    return bool(settings.effective_brevo_api_key and settings.effective_from_email)


def smtp_configured() -> bool:
    """Return True if required email delivery settings (Brevo API or SMTP) are available."""
    if brevo_api_configured():
        return True
    return bool(
        settings.SMTP_HOST
        and settings.SMTP_PORT
        and settings.effective_smtp_user
        and settings.effective_smtp_password
    )


def get_email_health() -> Dict[str, Any]:
    """Safe email health check returning public config status without exposing secrets."""
    configured = smtp_configured()
    mode = "brevo_api" if brevo_api_configured() else "smtp" if configured else "unconfigured"
    return {
        "configured": configured,
        "mode": mode,
        "smtp_host": settings.SMTP_HOST,
        "smtp_port": settings.SMTP_PORT,
        "sender_configured": bool(settings.effective_from_email),
        "sender_name": settings.SMTP_FROM_NAME,
        "from_email": settings.effective_from_email if configured else "",
        "server_time_ist": format_ist_datetime(),
    }


def _record_email_log(
    *,
    to_email: str,
    subject: str,
    event: str,
    status: str,
    complaint_id: Optional[str] = None,
    error: Optional[str] = None,
):
    """Safely log email history to MongoDB in background without blocking execution."""
    async def _insert():
        try:
            from database.db import get_database
            db = await get_database()
            if db is not None:
                await db.email_logs.insert_one({
                    "complaint_id": complaint_id,
                    "recipient": to_email,
                    "subject": subject,
                    "event": event,
                    "channel": "email",
                    "status": status,
                    "error": error,
                    "created_at": datetime.utcnow(),
                    "timestamp_ist": format_ist_datetime(),
                })
        except Exception as exc:
            logger.debug(f"[EMAIL] Could not write email log to MongoDB: {exc}")

    try:
        try:
            loop = asyncio.get_running_loop()
            asyncio.ensure_future(_insert(), loop=loop)
        except RuntimeError:
            asyncio.run(_insert())
    except Exception as e:
        logger.debug(f"[EMAIL] Could not schedule email log: {e}")


def _send_via_brevo_api(
    *,
    to_email: str,
    subject: str,
    html_content: str,
    text_content: Optional[str] = None,
    recipient_name: Optional[str] = None,
) -> Dict[str, Any]:
    """Send email directly via Brevo REST API v3 (bypasses SMTP port/IP restrictions)."""
    api_key = settings.effective_brevo_api_key
    from_email = settings.effective_from_email or "manishankar9in@gmail.com"
    from_name = settings.SMTP_FROM_NAME or "Smart Public Complaint System"

    payload = {
        "sender": {"name": from_name, "email": from_email},
        "to": [{"email": to_email, "name": recipient_name or to_email.split("@")[0]}],
        "subject": subject,
        "htmlContent": html_content,
    }
    if text_content:
        payload["textContent"] = text_content

    req = urllib.request.Request(
        "https://api.brevo.com/v3/smtp/email",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "accept": "application/json",
            "api-key": api_key,
            "content-type": "application/json",
            "User-Agent": "SmartGov-Backend/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            res_data = json.loads(response.read().decode())
            msg_id = res_data.get("messageId", "")
            logger.info(f"[EMAIL] Successfully delivered via Brevo API to {to_email} (messageId={msg_id})")
            return {"success": True, "message": "Email sent successfully via Brevo API", "message_id": msg_id}
    except urllib.error.HTTPError as http_err:
        raw = http_err.read().decode()
        logger.error(f"[EMAIL ERROR] Brevo API error ({http_err.code}): {raw}")
        return {"success": False, "message": f"Brevo API error: {http_err.code}", "error": raw}
    except Exception as exc:
        logger.error(f"[EMAIL ERROR] Brevo API connection failed: {exc}")
        return {"success": False, "message": "Brevo API connection failed", "error": str(exc)}


def send_email(
    *,
    to_email: str,
    subject: str,
    html_content: str,
    text_content: Optional[str] = None,
    event: str = "general_notification",
    complaint_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Centralized email sender supporting both Brevo REST API v3 and Brevo/Standard SMTP.
    """
    to_email = (to_email or "").strip()
    if not to_email:
        logger.warning("[EMAIL] Skipped: No recipient email provided.")
        return {"success": False, "message": "No recipient email provided.", "error": "MISSING_RECIPIENT"}

    if not smtp_configured():
        logger.warning(f"[EMAIL] Email service not configured — email not sent to {to_email}")
        _record_email_log(
            to_email=to_email,
            subject=subject,
            event=event,
            status="skipped",
            complaint_id=complaint_id,
            error="Email credentials not configured",
        )
        return {
            "success": False,
            "message": "Email credentials not configured on server.",
            "error": "NOT_CONFIGURED",
        }

    # 1. Try Brevo REST API v3 if API key is provided
    if settings.effective_brevo_api_key:
        logger.info(f"[EMAIL] Attempting delivery via Brevo REST API to {to_email}")
        api_res = _send_via_brevo_api(
            to_email=to_email,
            subject=subject,
            html_content=html_content,
            text_content=text_content,
        )
        if api_res.get("success"):
            _record_email_log(
                to_email=to_email,
                subject=subject,
                event=event,
                status="sent",
                complaint_id=complaint_id,
            )
            return api_res

    # 2. Try SMTP transport
    host = settings.SMTP_HOST
    port = settings.SMTP_PORT
    user = settings.effective_smtp_user
    password = settings.effective_smtp_password
    from_email = settings.effective_from_email or user
    from_name = settings.SMTP_FROM_NAME or "Smart Public Complaint System"

    # Build MIME message
    msg = MIMEMultipart("alternative")
    msg["Subject"] = Header(subject, "utf-8")
    msg["From"] = formataddr((str(Header(from_name, "utf-8")), from_email))
    msg["Reply-To"] = settings.SMTP_FROM_EMAIL or from_email
    msg["To"] = to_email
    # Set Date in Indian Standard Time (IST / +0530)
    msg["Date"] = get_ist_now().strftime("%a, %d %b %Y %H:%M:%S +0530")
    msg["X-Mailer"] = "SmartGov Automated System"
    msg["Auto-Submitted"] = "auto-generated"

    if text_content:
        msg.attach(MIMEText(text_content, "plain", "utf-8"))
    msg.attach(MIMEText(html_content, "html", "utf-8"))

    logger.info(f"[EMAIL] Connecting to SMTP ({host}:{port}) to send to {to_email}...")

    server = None
    try:
        server = smtplib.SMTP(host, port, timeout=20)
        server.ehlo()
        server.starttls()
        server.ehlo()
        
        logger.info("[EMAIL] Authenticating with SMTP...")
        server.login(user, password)
        logger.info("[EMAIL] SMTP authentication successful")

        logger.info(f"[EMAIL] Sending email to {to_email}...")
        refused = server.sendmail(from_email, [to_email], msg.as_string())
        
        if refused:
            logger.error(f"[EMAIL ERROR] Recipient {to_email} refused: {refused}")
            _record_email_log(
                to_email=to_email,
                subject=subject,
                event=event,
                status="failed",
                complaint_id=complaint_id,
                error=f"Recipient refused: {refused}",
            )
            return {"success": False, "message": "Recipient address was refused.", "error": str(refused)}

        logger.info(f"[EMAIL] Email sent successfully to {to_email}")
        _record_email_log(
            to_email=to_email,
            subject=subject,
            event=event,
            status="sent",
            complaint_id=complaint_id,
        )
        return {"success": True, "message": "Email sent successfully"}

    except smtplib.SMTPAuthenticationError as auth_err:
        code = getattr(auth_err, "smtp_code", None) or (auth_err.args[0] if auth_err.args else 0)
        msg_str = str(getattr(auth_err, "smtp_error", auth_err))
        if code == 525 or "525" in msg_str or "unauthorized ip" in msg_str.lower():
            logger.error("[EMAIL ERROR] Brevo rejected connection: 525 Unauthorized IP address")
            err_desc = (
                "Brevo SMTP 525 Unauthorized IP address. To resolve: "
                "1) In Brevo Dashboard (Transactional -> Configuration -> Authorized IPs), add your current IP 103.238.230.194 or disable IP restriction, "
                "OR 2) Generate a Brevo v3 API Key (xkeysib-...) and set BREVO_API_KEY in backend/.env"
            )
        else:
            logger.error(f"[EMAIL ERROR] SMTP authentication failed (code {code}): {msg_str}")
            err_desc = f"SMTP authentication failed: {msg_str}"

        _record_email_log(
            to_email=to_email,
            subject=subject,
            event=event,
            status="failed",
            complaint_id=complaint_id,
            error=err_desc,
        )
        return {"success": False, "message": "SMTP authentication failed", "error": err_desc}

    except smtplib.SMTPSenderRefused as sender_err:
        logger.error(f"[EMAIL ERROR] Invalid sender address ({from_email}): {sender_err}")
        err_desc = f"Rejected sender email ({from_email}). Ensure sender email is verified in your email provider."
        _record_email_log(
            to_email=to_email,
            subject=subject,
            event=event,
            status="failed",
            complaint_id=complaint_id,
            error=err_desc,
        )
        return {"success": False, "message": "Sender email not verified.", "error": err_desc}

    except smtplib.SMTPRecipientsRefused as rec_err:
        logger.error(f"[EMAIL ERROR] Recipient rejected: {rec_err}")
        _record_email_log(
            to_email=to_email,
            subject=subject,
            event=event,
            status="failed",
            complaint_id=complaint_id,
            error=str(rec_err),
        )
        return {"success": False, "message": "Recipient email rejected", "error": str(rec_err)}

    except (socket.timeout, TimeoutError) as timeout_err:
        logger.error(f"[EMAIL ERROR] SMTP connection timed out: {timeout_err}")
        err_desc = "Connection to SMTP server timed out."
        _record_email_log(
            to_email=to_email,
            subject=subject,
            event=event,
            status="failed",
            complaint_id=complaint_id,
            error=err_desc,
        )
        return {"success": False, "message": "SMTP connection timed out", "error": err_desc}

    except Exception as exc:
        logger.error(f"[EMAIL ERROR] Failed to send email: {exc}")
        _record_email_log(
            to_email=to_email,
            subject=subject,
            event=event,
            status="failed",
            complaint_id=complaint_id,
            error=str(exc),
        )
        return {"success": False, "message": "Failed to send email", "error": str(exc)}

    finally:
        if server:
            try:
                server.quit()
            except Exception:
                pass


# ==============================================================================
# EMAIL TEMPLATE BUILDERS & LIFECYCLE EVENT HANDLERS
# ==============================================================================

def _get_base_html_template(
    title: str,
    badge_text: str,
    badge_color: str,
    greeting_name: str,
    intro_message: str,
    details_dict: Dict[str, str],
    action_button_text: Optional[str] = None,
    action_button_url: Optional[str] = None,
    footer_note: Optional[str] = None,
) -> str:
    """Standardized high-aesthetic SmartGov responsive HTML email template."""
    portal_url = action_button_url or settings.FRONTEND_URL
    rows_html = "".join(
        f"""
        <tr>
          <td style="padding:8px 12px;font-size:13px;color:#64748b;font-weight:bold;width:35%;border-bottom:1px solid #f1f5f9;vertical-align:top;">{key}</td>
          <td style="padding:8px 12px;font-size:13px;color:#1e293b;border-bottom:1px solid #f1f5f9;vertical-align:top;">{val}</td>
        </tr>
        """
        for key, val in details_dict.items() if val
    )

    btn_html = ""
    if action_button_text:
        btn_html = f"""
        <div style="margin:24px 0 16px 0;text-align:center;">
          <a href="{portal_url}"
             style="background:#16a34a;color:#ffffff;padding:12px 28px;border-radius:8px;
                    text-decoration:none;font-weight:bold;display:inline-block;font-size:14px;box-shadow:0 2px 6px rgba(22,163,74,0.3);">
            {action_button_text}
          </a>
        </div>
        """

    footer_text = footer_note or "You can track real-time updates anytime from your SmartGov citizen portal."

    return f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>{title}</title>
    </head>
    <body style="margin:0;padding:20px;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
      <div style="max-width:580px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 4px 12px rgba(0,0,0,0.05);">
        
        <!-- Header -->
        <div style="background:#0f172a;padding:20px 24px;border-bottom:3px solid #16a34a;">
          <table style="width:100%;">
            <tr>
              <td>
                <h1 style="margin:0;color:#ffffff;font-size:18px;font-weight:bold;letter-spacing:0.5px;">
                  Smart Public Complaint
                </h1>
                <p style="margin:4px 0 0 0;color:#34d399;font-size:12px;font-weight:600;">
                  Stronger Communities | Better Governance
                </p>
              </td>
              <td style="text-align:right;">
                <span style="background:{badge_color};color:#ffffff;padding:4px 10px;border-radius:12px;font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;display:inline-block;">
                  {badge_text}
                </span>
              </td>
            </tr>
          </table>
        </div>

        <!-- Content Body -->
        <div style="padding:24px;">
          <p style="font-size:15px;color:#1e293b;margin:0 0 12px 0;">
            Hello <strong>{greeting_name}</strong>,
          </p>
          <p style="font-size:14px;color:#475569;line-height:1.6;margin:0 0 20px 0;">
            {intro_message}
          </p>

          <!-- Details Table -->
          <div style="background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;margin-bottom:20px;overflow:hidden;">
            <table style="width:100%;border-collapse:collapse;">
              {rows_html}
            </table>
          </div>

          {btn_html}

          <p style="font-size:12px;color:#64748b;line-height:1.5;margin:20px 0 0 0;text-align:center;">
            {footer_text}
          </p>
        </div>

        <!-- Footer -->
        <div style="background:#f1f5f9;padding:16px 24px;border-top:1px solid #e2e8f0;text-align:center;">
          <p style="margin:0;font-size:11px;color:#94a3b8;">
            © Smart Public Complaint Management System. Automated official notification (IST).
          </p>
        </div>

      </div>
    </body>
    </html>
    """


# A. COMPLAINT SUBMITTED (To Citizen)
def send_complaint_submitted_email(
    *,
    to_email: str,
    citizen_name: str = "Citizen",
    complaint_id: str,
    category: str,
    department: str,
    priority: str = "Medium",
    status: str = "Submitted",
    created_at: Optional[datetime] = None,
    address: Optional[str] = None,
) -> Dict[str, Any]:
    date_str = format_ist_datetime(created_at, "%d-%m-%Y %I:%M %p IST")
    subject = f"Complaint Submitted Successfully - {complaint_id}"
    
    details = {
        "Complaint ID": f"<code style='color:#0f172a;font-weight:bold;'>{complaint_id}</code>",
        "Category": category,
        "Department": department,
        "Priority Level": f"<span style='font-weight:bold;color:#b45309;'>{priority}</span>",
        "Current Status": f"<span style='background:#dcfce7;color:#166534;padding:2px 8px;border-radius:4px;font-weight:bold;'>{status}</span>",
        "Submitted Date (IST)": date_str,
        "Location / Address": address or "Recorded via GPS",
    }
    
    text_body = (
        f"Hello {citizen_name},\n\n"
        f"Your complaint has been successfully submitted.\n"
        f"Complaint ID: {complaint_id}\n"
        f"Category: {category}\n"
        f"Department: {department}\n"
        f"Priority: {priority}\n"
        f"Status: {status}\n"
        f"Date: {date_str}\n"
        f"Address: {address or 'Recorded via GPS'}\n\n"
        f"You can track the complaint from your Smart Public Complaint System dashboard:\n"
        f"{settings.FRONTEND_URL}\n\n"
        "Thank you,\nSmart Public Complaint System"
    )

    html_body = _get_base_html_template(
        title="Complaint Submitted",
        badge_text="SUBMITTED",
        badge_color="#16a34a",
        greeting_name=citizen_name,
        intro_message="Your public grievance complaint has been received and registered in the system. Our municipal response team and automated routing engine are reviewing your request.",
        details_dict=details,
        action_button_text="Track Complaint Status",
        action_button_url=f"{settings.FRONTEND_URL}/complaint/{complaint_id}",
    )

    return send_email(
        to_email=to_email,
        subject=subject,
        html_content=html_body,
        text_content=text_body,
        event="complaint_submitted",
        complaint_id=complaint_id,
    )


# B. WORKER ASSIGNED (To Citizen)
def send_worker_assigned_email(
    *,
    to_email: str,
    citizen_name: str = "Citizen",
    complaint_id: str,
    category: str,
    department: str,
    worker_name: str = "Field Technician",
    status: str = "Assigned",
) -> Dict[str, Any]:
    date_str = format_ist_datetime(None, "%d-%m-%Y %I:%M %p IST")
    subject = f"Worker Assigned - {complaint_id}"
    details = {
        "Complaint ID": complaint_id,
        "Category": category,
        "Department": department,
        "Assigned Field Worker": worker_name,
        "Current Status": status,
        "Assigned Date (IST)": date_str,
    }
    text_body = (
        f"Hello {citizen_name},\n\n"
        f"A field worker has been assigned to your complaint #{complaint_id}.\n"
        f"Assigned Worker: {worker_name}\n"
        f"Department: {department}\n"
        f"Category: {category}\n"
        f"Status: {status}\n"
        f"Assigned At: {date_str}\n\n"
        f"Track progress: {settings.FRONTEND_URL}/complaint/{complaint_id}\n\n"
        "— Smart Public Complaint System"
    )
    html_body = _get_base_html_template(
        title="Worker Assigned",
        badge_text="ASSIGNED",
        badge_color="#2563eb",
        greeting_name=citizen_name,
        intro_message=f"Good news! A municipal field worker (<strong>{worker_name}</strong>) has been officially assigned to inspect and resolve your complaint.",
        details_dict=details,
        action_button_text="View Assignment Details",
        action_button_url=f"{settings.FRONTEND_URL}/complaint/{complaint_id}",
    )
    return send_email(
        to_email=to_email,
        subject=subject,
        html_content=html_body,
        text_content=text_body,
        event="worker_assigned",
        complaint_id=complaint_id,
    )


# C. WORKER NEW ASSIGNMENT (To Assigned Worker)
def send_worker_new_assignment_email(
    *,
    to_email: str,
    worker_name: str = "Worker",
    complaint_id: str,
    category: str,
    department: str,
    priority: str,
    location: str,
    description: str,
    required_action: str = "Inspect site, commence work, and upload GPS photographic resolution proof.",
) -> Dict[str, Any]:
    date_str = format_ist_datetime(None, "%d-%m-%Y %I:%M %p IST")
    subject = f"New Complaint Assigned - {complaint_id}"
    details = {
        "Complaint ID": complaint_id,
        "Category": category,
        "Department": department,
        "Priority": priority,
        "Location": location,
        "Assigned Date (IST)": date_str,
        "Description Summary": description,
        "Required Action": required_action,
    }
    text_body = (
        f"Hello {worker_name},\n\n"
        f"You have been assigned a new task: #{complaint_id}.\n"
        f"Category: {category}\n"
        f"Priority: {priority}\n"
        f"Location: {location}\n"
        f"Date: {date_str}\n"
        f"Description: {description}\n"
        f"Required Action: {required_action}\n\n"
        f"Please log in to your Worker Portal to accept and update this mission:\n"
        f"{settings.FRONTEND_URL}/worker-dashboard\n\n"
        "— SmartGov Operations"
    )
    html_body = _get_base_html_template(
        title="New Task Assigned",
        badge_text="NEW MISSION",
        badge_color="#d97706",
        greeting_name=worker_name,
        intro_message="You have been assigned a new field complaint. Please review the details below and proceed to the site.",
        details_dict=details,
        action_button_text="Open Worker Dashboard",
        action_button_url=f"{settings.FRONTEND_URL}/worker-dashboard",
    )
    return send_email(
        to_email=to_email,
        subject=subject,
        html_content=html_body,
        text_content=text_body,
        event="worker_new_assignment",
        complaint_id=complaint_id,
    )


# D. WORK STARTED (To Citizen)
def send_work_started_email(
    *,
    to_email: str,
    citizen_name: str = "Citizen",
    complaint_id: str,
    category: str,
    department: str,
    worker_name: Optional[str] = None,
) -> Dict[str, Any]:
    date_str = format_ist_datetime(None, "%d-%m-%Y %I:%M %p IST")
    subject = f"Work Started - {complaint_id}"
    details = {
        "Complaint ID": complaint_id,
        "Status": "In Progress",
        "Category": category,
        "Department": department,
        "Assigned Worker": worker_name or "Municipal Field Team",
        "Started At (IST)": date_str,
    }
    text_body = (
        f"Hello {citizen_name},\n\n"
        f"Work has started on your complaint #{complaint_id}.\n"
        f"Status: In Progress\n"
        f"Department: {department}\n"
        f"Started At: {date_str}\n\n"
        f"Track live updates: {settings.FRONTEND_URL}/complaint/{complaint_id}\n\n"
        "— Smart Public Complaint System"
    )
    html_body = _get_base_html_template(
        title="Work In Progress",
        badge_text="IN PROGRESS",
        badge_color="#7c3aed",
        greeting_name=citizen_name,
        intro_message="Field technicians have arrived on site and actively commenced work to fix the reported issue.",
        details_dict=details,
        action_button_text="Track Live Progress",
        action_button_url=f"{settings.FRONTEND_URL}/complaint/{complaint_id}",
    )
    return send_email(
        to_email=to_email,
        subject=subject,
        html_content=html_body,
        text_content=text_body,
        event="work_started",
        complaint_id=complaint_id,
    )


# E. WORKER MARKED RESOLVED (To Admin)
def send_worker_marked_resolved_email(
    *,
    to_email: str,
    admin_name: str = "Administrator",
    complaint_id: str,
    worker_name: str,
    department: str,
    resolution_status: str = "WORKER_COMPLETED",
    resolution_proof_info: Optional[str] = None,
) -> Dict[str, Any]:
    date_str = format_ist_datetime(None, "%d-%m-%Y %I:%M %p IST")
    subject = f"Complaint Requires Verification - {complaint_id}"
    details = {
        "Complaint ID": complaint_id,
        "Field Worker": worker_name,
        "Department": department,
        "Resolution Status": resolution_status,
        "Completed At (IST)": date_str,
        "Proof Information": resolution_proof_info or "GPS Photo proof uploaded by worker.",
    }
    text_body = (
        f"Hello {admin_name},\n\n"
        f"Worker {worker_name} has completed work on complaint #{complaint_id}.\n"
        f"Department: {department}\n"
        f"Status: {resolution_status}\n"
        f"Timestamp: {date_str}\n\n"
        f"Please verify resolution in Admin Portal: {settings.FRONTEND_URL}/admin-dashboard\n\n"
        "— Smart Public Complaint System"
    )
    html_body = _get_base_html_template(
        title="Verification Required",
        badge_text="AUDIT REQUIRED",
        badge_color="#0891b2",
        greeting_name=admin_name,
        intro_message="A field technician has completed maintenance and uploaded resolution proof. Your audit and verification are requested.",
        details_dict=details,
        action_button_text="Review & Verify in Admin Portal",
        action_button_url=f"{settings.FRONTEND_URL}/admin-dashboard",
    )
    return send_email(
        to_email=to_email,
        subject=subject,
        html_content=html_body,
        text_content=text_body,
        event="worker_marked_resolved",
        complaint_id=complaint_id,
    )


# F. ADMIN VERIFIED RESOLUTION (To Citizen)
def send_admin_verified_email(
    *,
    to_email: str,
    citizen_name: str = "Citizen",
    complaint_id: str,
    category: str,
    department: str,
    verified_date: Optional[datetime] = None,
) -> Dict[str, Any]:
    date_str = format_ist_datetime(verified_date, "%d-%m-%Y %I:%M %p IST")
    subject = f"Complaint Resolved - {complaint_id}"
    details = {
        "Complaint ID": complaint_id,
        "Category": category,
        "Department": department,
        "Final Status": "Resolved & Verified",
        "Verification Date (IST)": date_str,
    }
    text_body = (
        f"Hello {citizen_name},\n\n"
        f"Your complaint #{complaint_id} regarding {category} has been successfully resolved and verified by the administration.\n"
        f"Status: RESOLVED\n"
        f"Date (IST): {date_str}\n\n"
        f"Please visit your dashboard to rate the service: {settings.FRONTEND_URL}/complaint/{complaint_id}\n\n"
        "— Smart Public Complaint System"
    )
    html_body = _get_base_html_template(
        title="Complaint Resolved",
        badge_text="RESOLVED",
        badge_color="#16a34a",
        greeting_name=citizen_name,
        intro_message="Your grievance has been successfully addressed and verified by the administrative review authority.",
        details_dict=details,
        action_button_text="Provide Citizen Feedback",
        action_button_url=f"{settings.FRONTEND_URL}/complaint/{complaint_id}",
    )
    return send_email(
        to_email=to_email,
        subject=subject,
        html_content=html_body,
        text_content=text_body,
        event="admin_verified",
        complaint_id=complaint_id,
    )


# G. ADMIN REJECTED RESOLUTION (To Worker)
def send_admin_rejected_email(
    *,
    to_email: str,
    worker_name: str = "Worker",
    complaint_id: str,
    rejection_reason: str,
    required_next_action: str = "Re-inspect location, correct outstanding issues, and resubmit proof.",
) -> Dict[str, Any]:
    date_str = format_ist_datetime(None, "%d-%m-%Y %I:%M %p IST")
    subject = f"Resolution Rejected - {complaint_id}"
    details = {
        "Complaint ID": complaint_id,
        "Status": "Reopened / Work Rejected",
        "Rejection Reason": rejection_reason or "Proof inadequate or issue unresolved.",
        "Audited At (IST)": date_str,
        "Next Action Required": required_next_action,
    }
    text_body = (
        f"Hello {worker_name},\n\n"
        f"Your resolution submission for complaint #{complaint_id} was rejected by administration.\n"
        f"Reason: {rejection_reason}\n"
        f"Timestamp: {date_str}\n"
        f"Required Action: {required_next_action}\n\n"
        f"Please check your Worker Portal: {settings.FRONTEND_URL}/worker-dashboard\n\n"
        "— Smart Public Complaint System"
    )
    html_body = _get_base_html_template(
        title="Resolution Inadequate",
        badge_text="REWORK REQUIRED",
        badge_color="#dc2626",
        greeting_name=worker_name,
        intro_message="The administration has reviewed your uploaded resolution proof and determined that additional work is required.",
        details_dict=details,
        action_button_text="Open Worker Dashboard",
        action_button_url=f"{settings.FRONTEND_URL}/worker-dashboard",
    )
    return send_email(
        to_email=to_email,
        subject=subject,
        html_content=html_body,
        text_content=text_body,
        event="admin_rejected",
        complaint_id=complaint_id,
    )


# H. GENERIC STATUS CHANGE / NOTIFICATION EMAIL
def send_complaint_notification_email(
    *,
    to_email: str,
    name: str = "Citizen",
    complaint_id: str = "N/A",
    category: str = "General Complaint",
    status: str = "PROCESSING",
    message: str = "",
) -> bool:
    """Backward-compatible helper used across existing notification endpoints."""
    date_str = format_ist_datetime(None, "%d-%m-%Y %I:%M %p IST")
    subject = f"SmartGov Update: Complaint #{complaint_id[:8] if len(complaint_id) > 8 else complaint_id} [{status}]"
    details = {
        "Complaint ID": complaint_id,
        "Category": category,
        "Status": status,
        "Updated At (IST)": date_str,
        "Message": message or "Status updated in system.",
    }
    text_body = (
        f"Hello {name},\n\n"
        f"Your complaint #{complaint_id} regarding {category} has been updated.\n"
        f"Status: {status}\n"
        f"Date: {date_str}\n"
        f"Details: {message}\n\n"
        f"Track online: {settings.FRONTEND_URL}\n\n"
        "— SmartGov Team"
    )
    html_body = _get_base_html_template(
        title="Status Update",
        badge_text=status.replace("_", " "),
        badge_color="#16a34a",
        greeting_name=name,
        intro_message=f"There is an update on your complaint regarding <strong>{category}</strong>.",
        details_dict=details,
        action_button_text="View Status",
        action_button_url=f"{settings.FRONTEND_URL}/complaint/{complaint_id}",
    )
    res = send_email(
        to_email=to_email,
        subject=subject,
        html_content=html_body,
        text_content=text_body,
        event="status_update",
        complaint_id=complaint_id,
    )
    return res.get("success", False)


# WORKER PASSWORD RESET EMAIL
def send_worker_password_reset_email(*, to_email: str, name: str, reset_link: str) -> bool:
    date_str = format_ist_datetime(None, "%d-%m-%Y %I:%M %p IST")
    subject = "SmartGov — Reset Your Worker Password"
    text_body = (
        f"Hello {name},\n\n"
        f"We received a request to reset your worker account password on {date_str}.\n\n"
        f"Click the link below to set a new password (valid for 1 hour):\n{reset_link}\n\n"
        "If you did not request this, you can safely ignore this email.\n\n"
        "— SmartGov Team"
    )
    html_body = f"""
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
      <h2 style="color:#1e3a8a;margin-top:0;">SmartGov Worker Portal</h2>
      <p>Hello <strong>{name}</strong>,</p>
      <p>We received a request to reset your worker account password on <strong>{date_str}</strong>.</p>
      <p style="margin:28px 0;text-align:center;">
        <a href="{reset_link}"
           style="background:#d97706;color:#ffffff;padding:12px 24px;border-radius:8px;
                  text-decoration:none;font-weight:bold;display:inline-block;">
          Reset Password
        </a>
      </p>
      <p style="font-size:13px;color:#64748b;">This link expires in 1 hour. If you did not request a reset, ignore this email.</p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
      <p style="font-size:12px;color:#94a3b8;margin:0;">Smart Public Complaint Priority and Response System</p>
    </div>
    """
    res = send_email(
        to_email=to_email,
        subject=subject,
        html_content=html_body,
        text_content=text_body,
        event="worker_password_reset",
    )
    return res.get("success", False)


# TEST EMAIL
def send_test_email(to_email: str) -> Dict[str, Any]:
    date_str = format_ist_datetime(None, "%d-%m-%Y %I:%M:%S %p IST")
    subject = "Smart Public Complaint System - Brevo Test"
    text_body = (
        "Hello,\n\n"
        "This is a test email from the Smart Public Complaint System.\n"
        f"Brevo SMTP integration is working correctly. Timestamp (IST): {date_str}\n\n"
        "— Smart Public Complaint System"
    )
    html_body = _get_base_html_template(
        title="Brevo SMTP Test",
        badge_text="TEST VERIFIED",
        badge_color="#16a34a",
        greeting_name="Developer / Administrator",
        intro_message="This is a test email from the Smart Public Complaint System. Brevo SMTP integration is functioning smoothly with STARTTLS on port 587.",
        details_dict={
            "SMTP Host": settings.SMTP_HOST,
            "SMTP Port": str(settings.SMTP_PORT),
            "Sender Email": settings.effective_from_email,
            "Timestamp (IST)": date_str,
        },
        action_button_text="Visit System Portal",
        action_button_url=settings.FRONTEND_URL,
    )
    return send_email(
        to_email=to_email,
        subject=subject,
        html_content=html_body,
        text_content=text_body,
        event="brevo_test",
    )


# WORKER EMAIL VERIFICATION
def send_worker_verification_email(*, to_email: str, name: str, verify_link: str) -> bool:
    """Send a styled email verification link to a newly registered worker."""
    date_str = format_ist_datetime(None, "%d-%m-%Y %I:%M %p IST")
    subject = "SmartGov — Verify Your Worker Account Email"
    text_body = (
        f"Hello {name},\n\n"
        f"Thank you for registering as a Field Worker on SmartGov on {date_str}!\n\n"
        f"Please verify your email address by clicking the link below (valid for 24 hours):\n"
        f"{verify_link}\n\n"
        f"If you did not register for a SmartGov Worker account, please ignore this email.\n\n"
        "— SmartGov Team"
    )
    html_body = f"""
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 4px 12px rgba(0,0,0,0.06);">

      <!-- Header -->
      <div style="background:#0f172a;padding:24px;border-bottom:3px solid #d97706;">
        <table style="width:100%;"><tr>
          <td>
            <h1 style="margin:0;color:#ffffff;font-size:18px;font-weight:bold;">🏛️ SmartGov Worker Portal</h1>
            <p style="margin:4px 0 0;color:#94a3b8;font-size:12px;">Smart Public Complaint Priority &amp; Response System</p>
          </td>
          <td style="text-align:right;">
            <span style="background:#d97706;color:#fff;padding:4px 12px;border-radius:12px;font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;">Verify Email</span>
          </td>
        </tr></table>
      </div>

      <!-- Body -->
      <div style="padding:28px 24px;">
        <p style="font-size:15px;color:#1e293b;margin:0 0 10px;">Hello <strong>{name}</strong>,</p>
        <p style="font-size:14px;color:#475569;line-height:1.7;margin:0 0 24px;">
          Thank you for registering as a <strong>Field Worker</strong> on SmartGov!
          Before you can sign in, please confirm your email address by clicking the button below.
        </p>

        <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px 18px;margin-bottom:24px;">
          <p style="margin:0;font-size:13px;color:#92400e;">
            ⏰ Sent: <strong>{date_str}</strong>. This link is valid for <strong>24 hours</strong>. If it expires, use "Forgot Password" on the Worker Login page to receive a new link.
          </p>
        </div>

        <div style="text-align:center;margin:24px 0;">
          <a href="{verify_link}"
             style="background:#d97706;color:#ffffff;padding:14px 32px;border-radius:10px;
                    text-decoration:none;font-weight:bold;display:inline-block;font-size:15px;
                    box-shadow:0 3px 8px rgba(217,119,6,0.35);letter-spacing:0.3px;">
            ✅ Verify My Email Address
          </a>
        </div>

        <p style="font-size:12px;color:#94a3b8;text-align:center;margin:20px 0 0;line-height:1.6;">
          Or copy and paste this URL into your browser:<br>
          <span style="word-break:break-all;color:#475569;">{verify_link}</span>
        </p>
      </div>

      <!-- Footer -->
      <div style="background:#f8fafc;padding:16px 24px;border-top:1px solid #e2e8f0;text-align:center;">
        <p style="margin:0;font-size:11px;color:#94a3b8;">
          © Smart Public Complaint Management System — Automated official notification.
        </p>
      </div>
    </div>
    """
    res = send_email(
        to_email=to_email,
        subject=subject,
        html_content=html_body,
        text_content=text_body,
        event="worker_email_verification",
    )
    return res.get("success", False)


# CITIZEN / PUBLIC USER EMAIL VERIFICATION
def send_citizen_verification_email(*, to_email: str, name: str, verify_link: str) -> bool:
    """Send a styled email verification link to a newly registered citizen user."""
    date_str = format_ist_datetime(None, "%d-%m-%Y %I:%M %p IST")
    subject = "SmartGov — Verify Your Account Email"
    text_body = (
        f"Hello {name},\n\n"
        f"Thank you for registering on SmartGov on {date_str}!\n\n"
        f"Please verify your email address by clicking the link below (valid for 24 hours):\n"
        f"{verify_link}\n\n"
        f"If you did not register for a SmartGov account, please ignore this email.\n\n"
        "— SmartGov Team"
    )
    html_body = f"""
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 4px 12px rgba(0,0,0,0.06);">

      <!-- Header -->
      <div style="background:#0f172a;padding:24px;border-bottom:3px solid #16a34a;">
        <table style="width:100%;"><tr>
          <td>
            <h1 style="margin:0;color:#ffffff;font-size:18px;font-weight:bold;">🏛️ SmartGov Citizen Portal</h1>
            <p style="margin:4px 0 0;color:#94a3b8;font-size:12px;">Smart Public Complaint Priority &amp; Response System</p>
          </td>
          <td style="text-align:right;">
            <span style="background:#16a34a;color:#fff;padding:4px 12px;border-radius:12px;font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;">Verify Email</span>
          </td>
        </tr></table>
      </div>

      <!-- Body -->
      <div style="padding:28px 24px;">
        <p style="font-size:15px;color:#1e293b;margin:0 0 10px;">Hello <strong>{name}</strong>,</p>
        <p style="font-size:14px;color:#475569;line-height:1.7;margin:0 0 24px;">
          Thank you for registering on <strong>SmartGov</strong>!
          Before you can access your account, please confirm your email address by clicking the button below.
        </p>

        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 18px;margin-bottom:24px;">
          <p style="margin:0;font-size:13px;color:#166534;">
            ⏰ Sent: <strong>{date_str}</strong>. This link is valid for <strong>24 hours</strong>. If it expires, please register again or contact support.
          </p>
        </div>

        <div style="text-align:center;margin:24px 0;">
          <a href="{verify_link}"
             style="background:#16a34a;color:#ffffff;padding:14px 32px;border-radius:10px;
                    text-decoration:none;font-weight:bold;display:inline-block;font-size:15px;
                    box-shadow:0 3px 8px rgba(22,163,74,0.35);letter-spacing:0.3px;">
            ✅ Verify My Email Address
          </a>
        </div>

        <p style="font-size:12px;color:#94a3b8;text-align:center;margin:20px 0 0;line-height:1.6;">
          Or copy and paste this URL into your browser:<br>
          <span style="word-break:break-all;color:#475569;">{verify_link}</span>
        </p>
      </div>

      <!-- Footer -->
      <div style="background:#f8fafc;padding:16px 24px;border-top:1px solid #e2e8f0;text-align:center;">
        <p style="margin:0;font-size:11px;color:#94a3b8;">
          © Smart Public Complaint Management System — Automated official notification.
        </p>
      </div>
    </div>
    """
    res = send_email(
        to_email=to_email,
        subject=subject,
        html_content=html_body,
        text_content=text_body,
        event="citizen_email_verification",
    )
    return res.get("success", False)
