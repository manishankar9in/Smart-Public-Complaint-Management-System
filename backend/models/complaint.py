from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class ComplaintCreate(BaseModel):
    firebase_uid: str
    category: str
    description: str
    proof_image_url: str
    gps_lat: float
    gps_long: float
    address: str
    state: Optional[str] = "Andhra Pradesh"
    city: Optional[str] = "Anantapur"
    street: Optional[str] = None
    village: Optional[str] = None
    ward: Optional[str] = None
    pincode: Optional[str] = None

class ComplaintResponse(ComplaintCreate):
    id: str = Field(..., alias="_id")
    priority_score: int
    priority_level: str
    department: Optional[str] = None
    worker_uid: Optional[str] = None
    status: str = "PENDING_ADMIN_VERIFY" 
    workflow_status: str = "NEW"
    created_at: datetime
    sla_deadline: Optional[datetime] = None
    sla_breached: Optional[bool] = False
    completed_at: Optional[datetime] = None
    worker_note: Optional[str] = None
    worker_proof_image_url: Optional[str] = None
    worker_gps_lat: Optional[float] = None
    worker_gps_long: Optional[float] = None
    admin_rejection_reason: Optional[str] = None
    admin_note: Optional[str] = None
    admin_response_message: Optional[str] = None
    admin_response_image_url: Optional[str] = None

class ComplaintVerifyUpdate(BaseModel):
    status: str = "VERIFIED"
    admin_note: Optional[str] = None

class WorkerAssignment(BaseModel):
    worker_uid: str
    status: str = "ASSIGNED_TO_WORKER"

class WorkerSolveUpdate(BaseModel):
    worker_proof_image_url: str
    worker_gps_lat: float
    worker_gps_long: float
    worker_note: Optional[str] = None
    status: str = "WORKER_COMPLETED"

class ComplaintFeedback(BaseModel):
    complaint_id: str
    rating: int
    solved: bool
    comment: Optional[str] = None


class AdminSolutionUpdate(BaseModel):
    """
    Final admin audit payload for approving or rejecting a worker resolution.
    When approved:
      - admin_response_message + admin_response_image_url are sent to the citizen
    When rejected:
      - admin_note (or admin_response_message) becomes admin_rejection_reason
    """
    admin_note: Optional[str] = None
    admin_response_message: Optional[str] = None
    admin_response_image_url: Optional[str] = None
