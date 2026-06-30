from fastapi import APIRouter, HTTPException
from datetime import datetime
from database.db import get_database
from services.notifications import create_notification
from services.worker_stats import increment_worker_solved, decrement_worker_solved
from database.mongo_json import mongo_to_jsonable

router = APIRouter()

from models.complaint import ComplaintFeedback
from bson import ObjectId

@router.post("/complaint", response_model=dict)
async def submit_complaint_feedback(feedback: ComplaintFeedback):
    db = await get_database()
    
    complaint = await db.complaints.find_one({"_id": ObjectId(feedback.complaint_id)})
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")

    if complaint.get("feedback"):
        raise HTTPException(status_code=400, detail="Feedback already submitted for this complaint.")
    
    feedback_data = feedback.model_dump()
    feedback_data["timestamp"] = datetime.utcnow()
    feedback_data["complaint_category"] = complaint.get("category")
    feedback_data["complaint_address"] = complaint.get("address")
    feedback_data["complaint_state"] = complaint.get("state")
    feedback_data["complaint_city"] = complaint.get("city")
    feedback_data["citizen_uid"] = complaint.get("firebase_uid")
    feedback_data["worker_uid"] = complaint.get("worker_uid")
    feedback_data["admin_reviewed"] = False
    await db.feedback.insert_one(feedback_data)
    
    if feedback.solved:
        status = "RESOLVED"
        workflow = "CLOSED"
    else:
        status = "REOPENED"
        workflow = "ESCALATED"

    prior_status = complaint.get("status")
    worker_uid = complaint.get("worker_uid")
    
    await db.complaints.update_one(
        {"_id": ObjectId(feedback.complaint_id)},
        {"$set": {
            "status": status,
            "workflow_status": workflow,
            "feedback": feedback_data,
        }}
    )

    if worker_uid:
        if feedback.solved and prior_status != "RESOLVED":
            await increment_worker_solved(db, str(worker_uid))
        elif not feedback.solved and prior_status == "RESOLVED":
            await decrement_worker_solved(db, str(worker_uid))

    if worker_uid:
        await create_notification(
            user_id=str(complaint.get("worker_uid")),
            message="Citizen feedback received on your completed task.",
            event_type="FEEDBACK_RECEIVED",
            complaint_id=feedback.complaint_id,
        )

    admin_cursor = db.admins.find({})
    admins = await admin_cursor.to_list(length=50)
    for admin in admins:
        admin_id = admin.get("firebase_uid") or str(admin.get("_id"))
        msg = (
            f"New citizen feedback ({feedback.rating}/5 stars) on complaint #{feedback.complaint_id[:8]}…"
            if feedback.solved
            else f"Issue NOT resolved — citizen reopened complaint #{feedback.complaint_id[:8]}…. Admin review needed."
        )
        await create_notification(
            user_id=admin_id,
            message=msg,
            event_type="ADMIN_FEEDBACK",
            complaint_id=feedback.complaint_id,
        )
    
    message = "Thank you! Your feedback has been recorded." if feedback.solved else "Issue reported to admin. They will review and follow up."
    return {"message": message}
