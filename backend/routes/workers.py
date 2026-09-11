from fastapi import APIRouter, HTTPException, Depends
from database.db import get_database
from database.mongo_json import mongo_to_jsonable
from models.complaint import WorkerSolveUpdate
from bson import ObjectId
from datetime import datetime
from services.notifications import create_notification
from services.email_service import send_work_started_email, send_worker_marked_resolved_email
from config import settings
import logging

from routes.worker_auth import get_worker_uid_from_token

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/tasks")
async def get_worker_tasks_me(worker_uid: str = Depends(get_worker_uid_from_token)):
    """List missions assigned to the authenticated worker (JWT), sorted by priority then date."""
    db = await get_database()
    PRIORITY_ORDER = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}

    cursor = db.complaints.find(
        {
            "worker_uid": worker_uid,
            "status": {"$in": ["ASSIGNED_TO_WORKER", "IN_PROGRESS", "REOPENED"]},
        }
    )
    tasks = await cursor.to_list(length=100)

    # Sort: priority level first (Critical→High→Medium→Low), then by created_at descending
    tasks.sort(key=lambda t: (
        PRIORITY_ORDER.get(t.get("priority_level", "Low"), 3),
        -t["created_at"].timestamp() if t.get("created_at") else 0,
    ))

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
        if complaint.get("firebase_uid"):
            await create_notification(
                user_id=complaint["firebase_uid"],
                message="Worker marked your complaint as completed. Awaiting admin verification.",
                event_type="WORKER_COMPLETED",
                complaint_id=complaint_id,
            )
        await create_notification(
            user_id=worker_uid,
            message="Complaint update submitted successfully.",
            event_type="WORK_SUBMITTED",
            complaint_id=complaint_id,
        )

        # Notify Admin via Brevo email that resolution proof is awaiting audit
        try:
            worker_doc = await db.workers.find_one({"worker_uid": worker_uid})
            if not worker_doc:
                try:
                    worker_doc = await db.workers.find_one({"_id": ObjectId(worker_uid)})
                except Exception:
                    worker_doc = None
            worker_name = worker_doc.get("name", "Field Worker") if worker_doc else "Field Worker"

            admin_email = settings.ADMIN_EMAIL
            if admin_email:
                send_worker_marked_resolved_email(
                    to_email=admin_email,
                    admin_name=settings.ADMIN_NAME,
                    complaint_id=complaint_id,
                    worker_name=worker_name,
                    department=complaint.get("department", "Municipal Maintenance"),
                    resolution_status="WORKER_COMPLETED",
                    resolution_proof_info=update.worker_note or "GPS Photo proof uploaded.",
                )
        except Exception as email_err:
            logger.warning(f"[EMAIL] Failed to send proof verification email to admin: {email_err}")

        return {"message": "Mission proof uploaded. Awaiting final audit."}

    raise HTTPException(status_code=404, detail="Mission not found")


@router.put("/mark-in-progress/{complaint_id}")
async def mark_in_progress(
    complaint_id: str,
    worker_uid: str = Depends(get_worker_uid_from_token),
):
    db = await get_database()
    complaint = await db.complaints.find_one({"_id": ObjectId(complaint_id)})
    if not complaint:
        raise HTTPException(status_code=404, detail="Mission not found")
    if str(complaint.get("worker_uid")) != worker_uid:
        raise HTTPException(status_code=403, detail="This complaint is not assigned to you")
    await db.complaints.update_one(
        {"_id": ObjectId(complaint_id)},
        {"$set": {"status": "IN_PROGRESS", "workflow_status": "IN_PROGRESS", "work_started_at": datetime.utcnow()}},
    )
    if complaint.get("firebase_uid"):
        await create_notification(
            user_id=complaint["firebase_uid"],
            message="Worker has started work on your complaint.",
            event_type="WORK_STARTED",
            complaint_id=complaint_id,
        )

        # Notify Citizen via Brevo email that work has started
        try:
            citizen_email = complaint.get("citizen_email")
            citizen_name = complaint.get("citizen_name", "Citizen")
            if not citizen_email:
                user_doc = await db.users.find_one({"firebase_uid": complaint["firebase_uid"]})
                if user_doc:
                    citizen_email = user_doc.get("email")
                    citizen_name = user_doc.get("name", citizen_name)
            
            if citizen_email:
                send_work_started_email(
                    to_email=citizen_email,
                    citizen_name=citizen_name,
                    complaint_id=complaint_id,
                    category=complaint.get("category", "General Issue"),
                    department=complaint.get("department", "Municipal Maintenance"),
                )
        except Exception as email_err:
            logger.warning(f"[EMAIL] Failed to send work started email: {email_err}")

    return {"message": "Complaint marked as in progress"}
