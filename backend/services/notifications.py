from datetime import datetime
from typing import Optional

from database.db import get_database


async def create_notification(
    *,
    user_id: str,
    message: str,
    event_type: str,
    complaint_id: Optional[str] = None,
) -> None:
    db = await get_database()
    await db.notifications.insert_one(
        {
            "user_id": user_id,
            "message": message,
            "event_type": event_type,
            "complaint_id": complaint_id,
            "read": False,
            "timestamp": datetime.utcnow(),
        }
    )

