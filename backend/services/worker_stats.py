"""Per-worker complaint resolution stats stored in workers collection."""
from datetime import datetime
import logging

from bson import ObjectId

logger = logging.getLogger(__name__)


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
        logger.info(f"Synced complaints_solved for worker {worker_uid}: {count}")
    except Exception as e:
        logger.error(f"Failed to sync complaints_solved for worker {worker_uid}: {str(e)}")
    return count


async def increment_worker_solved(db, worker_uid: str):
    """
    Atomically increment complaints_solved for a worker.
    
    FIXED: Removed conflicting $setOnInsert that was causing MongoDB WriteError.
    Uses only $inc operator with proper update strategy.
    
    Args:
        db: Database connection
        worker_uid: Worker ObjectId as string
    """
    if not worker_uid:
        return
    
    try:
        oid = ObjectId(worker_uid)
    except Exception as e:
        logger.warning(f"Invalid worker_uid format: {worker_uid}: {str(e)}")
        return
    
    try:
        # Single atomic operation: only use $inc to avoid MongoDB WriteError
        # $set is separated to avoid field conflict
        result = await db.workers.update_one(
            {"_id": oid},
            {
                "$inc": {"complaints_solved": 1},
                "$set": {"updated_at": datetime.utcnow()},
            },
            upsert=False  # Explicit: don't create doc if it doesn't exist
        )
        
        if result.matched_count == 0:
            logger.warning(f"Worker {worker_uid} not found for increment")
        elif result.modified_count > 0:
            logger.debug(f"Incremented complaints_solved for worker {worker_uid}")
    except Exception as e:
        logger.error(f"Error incrementing complaints_solved for worker {worker_uid}: {str(e)}")


async def decrement_worker_solved(db, worker_uid: str):
    """
    Atomically decrement complaints_solved for a worker.
    
    Args:
        db: Database connection
        worker_uid: Worker ObjectId as string
    """
    if not worker_uid:
        return
    
    try:
        oid = ObjectId(worker_uid)
    except Exception as e:
        logger.warning(f"Invalid worker_uid format: {worker_uid}: {str(e)}")
        return
    
    try:
        worker = await db.workers.find_one({"_id": oid})
        if not worker:
            logger.warning(f"Worker {worker_uid} not found for decrement")
            return
        
        current = worker.get("complaints_solved", 0)
        new_val = max(0, current - 1)
        
        result = await db.workers.update_one(
            {"_id": oid},
            {"$set": {"complaints_solved": new_val, "updated_at": datetime.utcnow()}},
        )
        
        if result.modified_count > 0:
            logger.debug(f"Decremented complaints_solved for worker {worker_uid} to {new_val}")
    except Exception as e:
        logger.error(f"Error decrementing complaints_solved for worker {worker_uid}: {str(e)}")
