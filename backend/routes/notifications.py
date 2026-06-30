from bson import ObjectId
from fastapi import APIRouter, HTTPException

from database.db import get_database
from database.mongo_json import mongo_to_jsonable

router = APIRouter()


@router.get("/{user_id}")
async def list_notifications(user_id: str, limit: int = 30):
    db = await get_database()
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


@router.put("/read-all/{user_id}")
async def mark_all_notifications_read(user_id: str):
    db = await get_database()
    await db.notifications.update_many({"user_id": user_id, "read": False}, {"$set": {"read": True}})
    return {"message": "All notifications marked as read"}

