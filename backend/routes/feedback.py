from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from database.db import get_database

router = APIRouter()

from models.complaint import ComplaintFeedback
from bson import ObjectId

@router.post("/complaint", response_model=dict)
async def submit_complaint_feedback(feedback: ComplaintFeedback):
    db = await get_database()
    
    # Check if complaint exists
    complaint = await db.complaints.find_one({"_id": ObjectId(feedback.complaint_id)})
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")
    
    # Store feedback
    feedback_data = feedback.dict()
    feedback_data["timestamp"] = datetime.utcnow()
    await db.feedback.insert_one(feedback_data)
    
    # Update complaint status based on "solved"
    if feedback.solved:
        status = "RESOLVED"
    else:
        status = "REOPENED"
    
    await db.complaints.update_one(
        {"_id": ObjectId(feedback.complaint_id)},
        {"$set": {
            "status": status,
            "workflow_status": "CLOSED" if feedback.solved else "ESCALATED",
            "feedback": feedback_data
        }}
    )
    
    message = "Thank you! Case resolved." if feedback.solved else "Mission reopened. Admin task queue updated."
    return {"message": message}
