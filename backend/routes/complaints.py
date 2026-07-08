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
    calculate_distance_meters,
    calculate_text_similarity,
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


async def check_duplicate_complaint(db, complaint: ComplaintCreate) -> dict:
    """
    Advanced duplicate complaint detection with multiple criteria.
    
    A complaint is flagged as potential duplicate ONLY if:
    1. Same category
    2. Within 30-50 meters (Haversine distance)
    3. Description similarity > 80% (using SequenceMatcher)
    4. Submitted within 24 hours
    
    Args:
        db: Database connection
        complaint: The new complaint being submitted
    
    Returns:
        dict with:
        - is_duplicate (bool): Whether a duplicate was found with high confidence
        - confidence_score (float): 0.0 to 100.0 percentage
        - matching_complaint_id (str): ID of similar complaint if found
        - details (dict): Breakdown of matching criteria
        - message (str): User-friendly explanation
    """
    
    # Check for recent complaints in the same category
    duplicate_window_start = datetime.utcnow() - timedelta(hours=24)
    
    # Initial query: same category + recent time window
    # This reduces the search space before expensive distance/similarity calculations
    recent_complaints = await db.complaints.find({
        "category": complaint.category,
        "created_at": {"$gte": duplicate_window_start},
    }).to_list(length=50)
    
    if not recent_complaints:
        logger.debug(f"No recent complaints in category '{complaint.category}' for duplicate check")
        return {
            "is_duplicate": False,
            "confidence_score": 0.0,
            "matching_complaint_id": None,
            "details": {},
            "message": "No matching complaints found."
        }
    
    logger.info(f"Found {len(recent_complaints)} recent complaints in category '{complaint.category}' for duplicate check")
    
    best_match = None
    best_confidence = 0.0
    DUPLICATE_THRESHOLD = 0.70  # Require 70%+ confidence to block submission (more conservative)
    
    for existing in recent_complaints:
        try:
            # Calculate distance using Haversine formula
            distance_m = calculate_distance_meters(
                complaint.gps_lat,
                complaint.gps_long,
                existing["gps_lat"],
                existing["gps_long"]
            )
            
            # Distance filter: Must be within 30-50m range for duplicate consideration
            # Beyond 50m: Skip entirely (definitely not a duplicate)
            # Under 30m: Could be duplicate (proceed to similarity check)
            # Between 30-50m: Could be duplicate (proceed to similarity check)
            if distance_m > 50:
                logger.debug(f"Existing complaint {existing['_id']} is {distance_m:.1f}m away - outside duplicate range")
                continue
            
            # Calculate description similarity
            description_similarity = calculate_text_similarity(
                complaint.description,
                existing["description"]
            )
            
            # For distances within 30-50m range: require 80%+ description similarity
            # For distances under 30m: allow slightly lower similarity (70%+) due to proximity
            min_similarity_threshold = 0.70 if distance_m < 30 else 0.80
            
            if description_similarity < min_similarity_threshold:
                logger.debug(
                    f"Complaint {existing['_id']}: description similarity {description_similarity:.2%} "
                    f"below threshold {min_similarity_threshold:.2%} for distance {distance_m:.1f}m"
                )
                continue
            
            # Time proximity (newer = higher score)
            time_diff = datetime.utcnow() - existing["created_at"]
            time_hours = time_diff.total_seconds() / 3600
            
            # Don't consider complaints older than 24 hours
            if time_hours > 24:
                logger.debug(f"Existing complaint {existing['_id']} is {time_hours:.1f}h old - outside 24h window")
                continue
            
            # Calculate weighted confidence:
            # - Description similarity: 50% weight (most important)
            # - Distance: 30% weight (closer = higher confidence)
            # - Time: 20% weight (more recent = higher confidence)
            
            # Normalize distance score (at 50m: 1.0, at 0m: also 1.0, beyond 50m: 0.0)
            # This creates a range where 30-50m is high confidence
            if distance_m <= 30:
                distance_score = 1.0  # Very close
            else:
                # Between 30-50m: score decreases as distance increases
                distance_score = 1.0 - ((distance_m - 30) / 20.0)  # Linear from 1.0 to 0.0
            
            # Time score: newer is better
            time_score = max(0.0, 1.0 - (time_hours / 24.0))
            
            # Calculate final confidence:
            confidence_score = (
                description_similarity * 0.50 +
                distance_score * 0.30 +
                time_score * 0.20
            )
            
            logger.debug(
                f"Complaint {existing['_id']}: "
                f"distance={distance_m:.1f}m (score={distance_score:.2f}), "
                f"description_sim={description_similarity:.2%}, "
                f"time_hours={time_hours:.1f} (score={time_score:.2f}), "
                f"confidence={confidence_score:.2%}"
            )
            
            # Track best match
            if confidence_score > best_confidence:
                best_confidence = confidence_score
                best_match = {
                    "complaint_id": str(existing["_id"]),
                    "distance_m": distance_m,
                    "description_similarity": description_similarity,
                    "time_hours": time_hours,
                    "confidence": confidence_score
                }
        
        except Exception as e:
            logger.error(f"Error comparing with complaint {existing.get('_id')}: {str(e)}")
            continue
    
    # Return results
    # Block only if confidence is high (70%+) AND description similarity is > 80%
    is_duplicate = (
        best_confidence >= 0.70 and 
        best_match and 
        best_match.get("description_similarity", 0) >= 0.80
    )
    
    result = {
        "is_duplicate": is_duplicate,
        "confidence_score": round(best_confidence * 100, 2),  # Convert to percentage
        "matching_complaint_id": best_match["complaint_id"] if best_match else None,
        "details": best_match or {},
        "message": ""
    }
    
    if is_duplicate:
        result["message"] = (
            f"Duplicate detection triggered (confidence: {result['confidence_score']}%). "
            f"A similar complaint exists {best_match['distance_m']:.0f}m away "
            f"({best_match['description_similarity']:.0%} description match) "
            f"from {best_match['time_hours']:.1f} hours ago."
        )
        logger.warning(
            f"Duplicate complaint detected for user {complaint.firebase_uid}: "
            f"matching complaint {best_match['complaint_id']} "
            f"(confidence: {result['confidence_score']}%)"
        )
    
    return result


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

        # Advanced duplicate complaint detection
        # Checks: category, distance (30-50m), description similarity (>80%), time (24h)
        duplicate_check = await check_duplicate_complaint(db, complaint)
        
        # Store duplicate analysis in complaint for audit trail
        complaint_dict["duplicate_check"] = {
            "is_duplicate": duplicate_check["is_duplicate"],
            "confidence_score": duplicate_check["confidence_score"],
            "matched_complaint_id": duplicate_check["matching_complaint_id"],
            "detection_details": duplicate_check["details"],
            "checked_at": datetime.utcnow()
        }
        
        # Only reject if high confidence duplicate detected
        if duplicate_check["is_duplicate"]:
            logger.warning(
                f"High-confidence duplicate detected for {complaint.firebase_uid}: "
                f"{duplicate_check['message']}"
            )
            raise HTTPException(
                status_code=409,
                detail=f"Duplicate complaint detected with {duplicate_check['confidence_score']}% confidence. "
                       f"Similar complaint already exists nearby ({duplicate_check['details'].get('distance_m', 0):.0f}m away). "
                       f"Please check existing complaints or provide additional details.",
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
