from bson import ObjectId
from fastapi import APIRouter, HTTPException

from database.db import get_database
from database.mongo_json import mongo_to_jsonable

router = APIRouter()


@router.get("/{user_id}")
async def list_notifications(user_id: str, limit: int = 30):
    db = await get_database()
    
    # Automatically clean up notifications for resolved complaints across all dashboards
    try:
        resolved_cursor = db.complaints.find(
            {"status": {"$in": ["RESOLVED", "CLOSED"]}},
            {"_id": 1}
        )
        resolved_docs = await resolved_cursor.to_list(length=2000)
        resolved_ids = [str(c["_id"]) for c in resolved_docs]
        if resolved_ids:
            await db.notifications.delete_many({"complaint_id": {"$in": resolved_ids}})
    except Exception:
        pass

    cursor = (
        db.notifications.find({"user_id": user_id})
        .sort("timestamp", -1)
        .limit(max(1, min(limit, 100)))
    )
    docs = await cursor.to_list(length=max(1, min(limit, 100)))
    unread = await db.notifications.count_documents({"user_id": user_id, "read": False})
    return {
        "items": [mongo_to_jsonable(x) for x in docs],
        "unread": unread,
    }


@router.put("/read/{notification_id}")
async def mark_notification_read(notification_id: str):
    db = await get_database()
    try:
        oid = ObjectId(notification_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid notification id")
    result = await db.notifications.update_one({"_id": oid}, {"$set": {"read": True}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"message": "Notification marked as read"}


from pydantic import BaseModel, EmailStr
from typing import Optional
from services.email_service import send_complaint_notification_email, smtp_configured

class SendEmailNotificationRequest(BaseModel):
    to_email: EmailStr
    name: Optional[str] = "Citizen"
    complaint_id: Optional[str] = "N/A"
    category: Optional[str] = "General Complaint"
    status: Optional[str] = "PROCESSING"
    message: Optional[str] = ""

@router.post("/send-email")
async def send_email_notification(body: SendEmailNotificationRequest):
    if not smtp_configured():
        return {
            "success": False,
            "message": "SMTP not configured on server. Email was skipped.",
        }
    
    sent = send_complaint_notification_email(
        to_email=body.to_email,
        name=body.name or "Citizen",
        complaint_id=body.complaint_id or "N/A",
        category=body.category or "General Complaint",
        status=body.status or "PROCESSING",
        message=body.message or "",
    )
    return {"success": sent, "message": "Email sent successfully" if sent else "Failed to send email"}

@router.put("/read-all/{user_id}")
async def mark_all_notifications_read(user_id: str):
    db = await get_database()
    await db.notifications.update_many({"user_id": user_id, "read": False}, {"$set": {"read": True}})
    return {"message": "All notifications marked as read"}


@router.delete("/clear-all/{user_id}")
async def clear_all_notifications(user_id: str):
    db = await get_database()
    await db.notifications.delete_many({"user_id": user_id})
    return {"message": "All notifications cleared"}


@router.delete("/{notification_id}")
async def delete_single_notification(notification_id: str):
    db = await get_database()
    try:
        oid = ObjectId(notification_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid notification id")
    result = await db.notifications.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"message": "Notification deleted"}

