from fastapi import APIRouter, HTTPException, Depends
from database.db import get_database
from database.mongo_json import mongo_to_jsonable
from models.complaint import WorkerSolveUpdate
from bson import ObjectId
from datetime import datetime

from routes.worker_auth import get_worker_uid_from_token

router = APIRouter()


@router.get("/tasks")
async def get_worker_tasks_me(worker_uid: str = Depends(get_worker_uid_from_token)):
    """List missions assigned to the authenticated worker (JWT)."""
    db = await get_database()
    cursor = db.complaints.find(
        {
            "worker_uid": worker_uid,
            "status": {"$in": ["ASSIGNED_TO_WORKER", "REOPENED"]},
        }
    )
    tasks = await cursor.to_list(length=100)
    return [mongo_to_jsonable(t) for t in tasks]


@router.put("/upload-proof/{complaint_id}")
async def upload_proof(
    complaint_id: str,
    update: WorkerSolveUpdate,
    worker_uid: str = Depends(get_worker_uid_from_token),
):
    db = await get_database()
    complaint = await db.complaints.find_one({"_id": ObjectId(complaint_id)})
    if not complaint:
        raise HTTPException(status_code=404, detail="Mission not found")
    if str(complaint.get("worker_uid")) != worker_uid:
        raise HTTPException(status_code=403, detail="This complaint is not assigned to you")

    result = await db.complaints.update_one(
        {"_id": ObjectId(complaint_id)},
        {
            "$set": {
                "status": "WORKER_COMPLETED",
                "workflow_status": "RESOLVED",
                "worker_proof_image_url": update.worker_proof_image_url,
                "worker_gps_lat": update.worker_gps_lat,
                "worker_gps_long": update.worker_gps_long,
                "worker_note": update.worker_note,
                "solved_at": datetime.utcnow(),
            }
        },
    )

    if result.modified_count == 1:
        await db.worker_updates.insert_one(
            {
                "complaint_id": complaint_id,
                "worker_uid": worker_uid,
                "worker_note": update.worker_note,
                "worker_proof": update.worker_proof_image_url,
                "timestamp": datetime.utcnow(),
            }
        )
        return {"message": "Mission proof uploaded. Awaiting final audit."}

    raise HTTPException(status_code=404, detail="Mission not found")
