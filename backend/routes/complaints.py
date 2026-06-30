from fastapi import APIRouter, HTTPException
from database.db import get_database
from database.mongo_json import mongo_to_jsonable
from models.complaint import ComplaintCreate, ComplaintResponse
from datetime import datetime, timedelta
from bson import ObjectId
from services.notifications import create_notification

router = APIRouter()

from scoring_engine.ai_priority import calculate_priority_score

SLA_HOURS = {
    "Critical": 2,
    "High": 6,
    "Medium": 24,
    "Low": 72,
}

async def get_sla_hours(db):
    settings = await db.db["settings"].find_one({"key": "sla_config"})
    if settings and isinstance(settings.get("value"), dict):
        return settings["value"]
    return SLA_HOURS

@router.post("/create", response_model=dict)
async def create_complaint(complaint: ComplaintCreate):
    db = await get_database()
    sla_hours = await get_sla_hours(db)
    
    complaint_dict = complaint.dict()

    # Duplicate complaint detection: same category within ~150m in the last 48h
    duplicate_window_start = datetime.utcnow() - timedelta(hours=48)
    approx_delta = 0.0015
    duplicate = await db.complaints.find_one(
        {
            "category": complaint.category,
            "created_at": {"$gte": duplicate_window_start},
            "gps_lat": {"$gte": complaint.gps_lat - approx_delta, "$lte": complaint.gps_lat + approx_delta},
            "gps_long": {"$gte": complaint.gps_long - approx_delta, "$lte": complaint.gps_long + approx_delta},
        }
    )
    if duplicate:
        raise HTTPException(
            status_code=409,
            detail="Similar complaint already exists nearby. Please track existing issue or provide additional details.",
        )
    
    # AI Priority Scoring (Automated on Submission)
    priority = calculate_priority_score(complaint.category, complaint.description)
    
    # Existing dashboard compatibility status + new workflow state
    complaint_dict["status"] = "PENDING_ADMIN_VERIFY"
    complaint_dict["workflow_status"] = "NEW"
    complaint_dict["priority_score"] = priority["score"]
    complaint_dict["priority_level"] = priority["level"]
    complaint_dict["department"] = priority["department"]
    complaint_dict["created_at"] = datetime.utcnow()
    complaint_dict["sla_deadline"] = datetime.utcnow() + timedelta(
        hours=sla_hours.get(priority["level"], 24)
    )
    complaint_dict["sla_breached"] = False
    complaint_dict["worker_uid"] = None
    complaint_dict["completed_at"] = None
    complaint_dict["ai_analysis"] = {
        "category": complaint.category,
        "severity": priority.get("severity"),
        "urgency": priority.get("urgency"),
        "impact": priority.get("impact"),
        "delay_risk": priority.get("delay_risk"),
        "sentiment": priority.get("sentiment"),
        "keywords": priority.get("keywords", []),
        "priority_formula": "severity*0.4 + urgency*0.3 + impact*0.2 + delay_risk*0.1",
    }

    # Store citizen email/name for EmailJS notifications.
    citizen = await db.users.find_one({"firebase_uid": complaint.firebase_uid}) or {}
    complaint_dict["citizen_email"] = citizen.get("email")
    complaint_dict["citizen_name"] = citizen.get("name", "Citizen")
    
    result = await db.complaints.insert_one(complaint_dict)
    complaint_id = str(result.inserted_id)
    await create_notification(
        user_id=complaint.firebase_uid,
        message=f"Complaint submitted for {complaint.category}. Status: Pending admin verification.",
        event_type="COMPLAINT_SUBMITTED",
        complaint_id=complaint_id,
    )
    
    return {
        "message": "Complaint raised with GPS proof. Your issue has been received and is under processing.", 
        "id": complaint_id,
        "priority": priority["level"]
    }

@router.get("/status/{uid}")
async def get_user_complaints(uid: str):
    db = await get_database()
    cursor = db.complaints.find({"firebase_uid": uid})
    complaints = await cursor.to_list(length=100)
    return [mongo_to_jsonable(c) for c in complaints]

@router.get("/public/stats")
async def get_public_stats():
    db = await get_database()
    total = await db.complaints.count_documents({})
    resolved = await db.complaints.count_documents({"status": "RESOLVED"})
    pending = await db.complaints.count_documents({"status": {"$ne": "RESOLVED"}})
    
    return {
        "total": total,
        "resolved": resolved,
        "active": pending
    }

@router.get("/{complaint_id}")
async def get_complaint_details(complaint_id: str):
    db = await get_database()
    complaint = await db.complaints.find_one({"_id": ObjectId(complaint_id)})
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")

    return mongo_to_jsonable(complaint)
