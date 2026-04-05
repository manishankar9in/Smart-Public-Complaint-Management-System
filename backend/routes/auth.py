from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from database.db import get_database
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

class UserSync(BaseModel):
    firebase_uid: str
    email: str
    role: str = "public" # public, worker, admin
    name: str = Field(default="User", min_length=1)
    state: Optional[str] = None
    city: Optional[str] = None
    ward: Optional[str] = None
    street: Optional[str] = None
    village: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None

    class Config:
        extra = "allow"  # Allow extra fields without validation error

@router.post("/sync")
async def sync_user(data: UserSync):
    try:
        db = await get_database()
        
        # Ensure required fields have valid values
        user_data = {
            "firebase_uid": data.firebase_uid,
            "email": data.email,
            "role": data.role or "public",
            "name": data.name or "User",  # Fallback if name is empty
            "updated_at": datetime.utcnow()
        }
        
        # Add optional fields if provided
        if data.state:
            user_data["state"] = data.state
        if data.city:
            user_data["city"] = data.city
        if data.ward:
            user_data["ward"] = data.ward
        if data.street:
            user_data["street"] = data.street
        if data.village:
            user_data["village"] = data.village
        if data.phone:
            user_data["phone"] = data.phone
        if data.address:
            user_data["address"] = data.address

        await db.users.update_one(
            {"firebase_uid": data.firebase_uid},
            {"$set": user_data},
            upsert=True,
        )

        user = await db.users.find_one({"firebase_uid": data.firebase_uid})
        logger.info(f"User synced: {data.firebase_uid}, role: {data.role}")
        if user:
            user["_id"] = str(user["_id"])
            return user
        return {"message": "Identity Synchronized", "status": "success"}
    except Exception as e:
        logger.error(f"Auth sync error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(e)}")

@router.get("/{firebase_uid}")
async def get_user_profile(firebase_uid: str):
    try:
        db = await get_database()
        user = await db.users.find_one({"firebase_uid": firebase_uid})
        if user:
            user["_id"] = str(user["_id"])
            return user
        logger.warning(f"User not found: {firebase_uid}")
        raise HTTPException(status_code=404, detail="Identity Profile not found in Secure Vault.")
    except Exception as e:
        logger.error(f"Get user error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch user: {str(e)}")
