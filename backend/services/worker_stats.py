"""Per-worker complaint resolution stats stored in workers collection."""
from datetime import datetime

from bson import ObjectId


async def sync_worker_solved_count(db, worker_uid: str) -> int:
    """Recompute solved count from resolved complaints."""
    count = await db.complaints.count_documents({
        "worker_uid": str(worker_uid),
        "status": "RESOLVED",
    })
    try:
        oid = ObjectId(worker_uid)
        await db.workers.update_one(
            {"_id": oid},
            {"$set": {"complaints_solved": count, "updated_at": datetime.utcnow()}},
        )
    except Exception:
        pass
    return count


async def increment_worker_solved(db, worker_uid: str):
    if not worker_uid:
        return
    try:
        oid = ObjectId(worker_uid)
    except Exception:
        return
    await db.workers.update_one(
        {"_id": oid},
        {
            "$inc": {"complaints_solved": 1},
            "$set": {"updated_at": datetime.utcnow()},
            "$setOnInsert": {"complaints_solved": 1},
        },
    )


async def decrement_worker_solved(db, worker_uid: str):
    if not worker_uid:
        return
    try:
        oid = ObjectId(worker_uid)
    except Exception:
        return
    worker = await db.workers.find_one({"_id": oid})
    if not worker:
        return
    current = worker.get("complaints_solved", 0)
    new_val = max(0, current - 1)
    await db.workers.update_one(
        {"_id": oid},
        {"$set": {"complaints_solved": new_val, "updated_at": datetime.utcnow()}},
    )
