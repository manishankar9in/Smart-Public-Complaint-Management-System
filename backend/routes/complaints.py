from fastapi import APIRouter, HTTPException, Request
from database.db import get_database
from database.mongo_json import mongo_to_jsonable
from models.complaint import ComplaintCreate, ComplaintResponse
from datetime import datetime, timedelta
from bson import ObjectId
from services.notifications import create_notification
from utils.validators import (
    sanitize_string,
    sanitize_description,
    sanitize_address,
    validate_coordinates,
    validate_pincode,
)
import logging

logger = logging.getLogger(__name__)
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
async def create_complaint(complaint: ComplaintCreate, request: Request):
    try:
        logger.info(f"Creating complaint for user: {complaint.firebase_uid}, category: {complaint.category}")
        
        # Validate image size (base64 string length check)
        if len(complaint.proof_image_url) > 10000000:  # ~10MB limit
            logger.warning(f"Image too large for user {complaint.firebase_uid}: {len(complaint.proof_image_url)} chars")
            raise HTTPException(
                status_code=413,
                detail="Image too large. Maximum size is 10MB. Please compress the image.",
            )
        
        # Validate GPS coordinates
        if not validate_coordinates(complaint.gps_lat, complaint.gps_long):
            logger.warning(f"Invalid GPS coordinates for user {complaint.firebase_uid}: {complaint.gps_lat}, {complaint.gps_long}")
            raise HTTPException(
                status_code=400,
                detail="Invalid GPS coordinates. Please provide valid latitude and longitude.",
            )
        
        # Validate pincode if provided
        if complaint.pincode and not validate_pincode(complaint.pincode):
            logger.warning(f"Invalid pincode for user {complaint.firebase_uid}: {complaint.pincode}")
            raise HTTPException(
                status_code=400,
                detail="Invalid pincode format. Please provide a valid 6-digit pincode.",
            )
        
        # Sanitize inputs
        sanitized_description = sanitize_description(complaint.description)
        sanitized_address = sanitize_address(complaint.address)
        sanitized_village = sanitize_string(complaint.village or "", max_length=200)
        sanitized_city = sanitize_string(complaint.city or "", max_length=100)
        sanitized_state = sanitize_string(complaint.state or "", max_length=100)
        
        if not sanitized_description:
            raise HTTPException(
                status_code=400,
                detail="Description cannot be empty after sanitization.",
            )
        
        db = await get_database()
        sla_hours = await get_sla_hours(db)
        
        complaint_dict = complaint.dict()
        
        # Apply sanitized values
        complaint_dict["description"] = sanitized_description
        complaint_dict["address"] = sanitized_address
        complaint_dict["village"] = sanitized_village
        complaint_dict["city"] = sanitized_city
        complaint_dict["state"] = sanitized_state

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
            logger.warning(f"Duplicate complaint detected for user {complaint.firebase_uid}")
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
        
        try:
            await create_notification(
                user_id=complaint.firebase_uid,
                message=f"Complaint submitted for {complaint.category}. Status: Pending admin verification.",
                event_type="COMPLAINT_SUBMITTED",
                complaint_id=complaint_id,
            )
        except Exception as notif_err:
            logger.warning(f"Notification creation failed for complaint {complaint_id}: {notif_err}")
            # Don't fail complaint submission if notification fails
        
        logger.info(f"Complaint created successfully: {complaint_id}")
        return {
            "message": "Complaint raised with GPS proof. Your issue has been received and is under processing.", 
            "id": complaint_id,
            "priority": priority["level"]
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating complaint for user {complaint.firebase_uid}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create complaint: {str(e)}")

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
