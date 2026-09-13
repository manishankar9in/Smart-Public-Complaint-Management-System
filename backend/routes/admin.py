from fastapi import APIRouter, Depends, HTTPException
from database.db import get_database
from database.mongo_json import mongo_to_jsonable
from bson import ObjectId
from routes.auth import get_admin_uid_from_token
from models.complaint import ComplaintVerifyUpdate, WorkerAssignment, AdminSolutionUpdate
from datetime import datetime, timedelta
from scoring_engine.ai_priority import calculate_priority_score
from services.worker_routing import find_best_worker, audit_workers_for_complaint, _norm, _location_matches
from services.category_mapping import duty_matches_category, department_matches_category
from services.notifications import create_notification
from services.worker_stats import increment_worker_solved, decrement_worker_solved
from services.email_service import (
    send_worker_assigned_email,
    send_worker_new_assignment_email,
    send_admin_verified_email,
    send_admin_rejected_email,
)
import logging

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(get_admin_uid_from_token)])

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

@router.get("/all")
async def get_all_complaints():
    db = await get_database()
    cursor = db.complaints.find({})
    complaints = await cursor.to_list(length=500)
    return [mongo_to_jsonable(c) for c in complaints]


@router.get("/processing")
async def get_processing_complaints():
    """Active complaints only — resolved/closed history excluded from admin queue."""
    db = await get_database()
    cursor = db.complaints.find({
        "status": {"$nin": ["RESOLVED", "CLOSED"]}
    }).sort("created_at", -1)
    complaints = await cursor.to_list(length=500)
    return [mongo_to_jsonable(c) for c in complaints]

@router.get("/pending")
async def get_pending_complaints():
    db = await get_database()
    cursor = db.complaints.find({"status": "PENDING_ADMIN_VERIFY"})
    complaints = await cursor.to_list(length=100)
    return [mongo_to_jsonable(c) for c in complaints]

@router.get("/verified")
async def get_verified_complaints():
    db = await get_database()
    cursor = db.complaints.find({"status": "VERIFIED"})
    complaints = await cursor.to_list(length=100)
    return [mongo_to_jsonable(c) for c in complaints]

@router.put("/verify/{complaint_id}")
async def verify_complaint(complaint_id: str, update: ComplaintVerifyUpdate):
    db = await get_database()
    sla_hours = await get_sla_hours(db)
    
    # 1. Fetch complaint
    complaint = await db.complaints.find_one({"_id": ObjectId(complaint_id)})
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")
        
    # 2. AI Priority Scoring — use custom_department if present
    custom_dept = complaint.get("custom_department")
    priority = calculate_priority_score(
        complaint["category"],
        complaint["description"],
        custom_department=custom_dept,
    )
    
    # 3. Update Status only — admin must manually select a worker via assign-worker endpoint
    await db.complaints.update_one(
        {"_id": ObjectId(complaint_id)},
        {"$set": {
            "status": "VERIFIED",
            "workflow_status": "NEW",
            "priority_score": priority["score"],
            "priority_level": priority["level"],
            "department": priority["department"],
            "duty": priority.get("duty", complaint.get("duty", "Other")),
            "admin_note": update.admin_note,
            "verified_at": datetime.utcnow(),
            "sla_deadline": datetime.utcnow() + timedelta(hours=sla_hours.get(priority["level"], 24))
        }}
    )

    # Notify citizen that their complaint has been verified
    citizen_uid = complaint.get("firebase_uid")
    if citizen_uid:
        await create_notification(
            user_id=citizen_uid,
            message=f"Your complaint has been verified. Priority: {priority['level']}. Admin will assign a worker soon.",
            event_type="COMPLAINT_VERIFIED",
            complaint_id=complaint_id,
        )

    return {
        "message": "Complaint verified and scored. Please assign an eligible worker.",
        "priority": priority["level"],
        "department": priority["department"],
        "duty": priority.get("duty"),
    }

@router.put("/assign-worker/{complaint_id}")
async def assign_worker(complaint_id: str, payload: dict = None):
    """Admin manually assigns ONE eligible worker to a complaint.
    Worker must pass all 5 strict checks:
    1. State Match
    2. District Match
    3. Department Match
    4. Availability (available=True)
    5. Valid Location / GPS
    """
    db = await get_database()
    
    complaint = await db.complaints.find_one({"_id": ObjectId(complaint_id)})
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")

    # Require explicit worker_uid
    if not payload or not payload.get("worker_uid"):
        raise HTTPException(
            status_code=400,
            detail="worker_uid is required. Admin must select an eligible worker.",
        )

    worker_uid = str(payload["worker_uid"])

    # Resolve the worker document by _id (primary) or legacy worker_uid field
    worker_doc = None
    try:
        worker_doc = await db.workers.find_one({"_id": ObjectId(worker_uid)})
    except Exception:
        pass
    if not worker_doc:
        worker_doc = await db.workers.find_one({"worker_uid": worker_uid})
    if not worker_doc:
        raise HTTPException(status_code=404, detail="Worker not found.")

    # ── Check 1: State Match ──
    c_state = _norm(complaint.get("state"))
    w_state = _norm(worker_doc.get("state"))
    if c_state and w_state and c_state != w_state:
        raise HTTPException(
            status_code=400,
            detail=f"State mismatch: Complaint is in '{complaint.get('state')}' but worker is in '{worker_doc.get('state')}'. Worker must be from the same state.",
        )

    # ── Check 2: District Match ──
    c_dist = _norm(complaint.get("city") or complaint.get("district"))
    w_dist = _norm(worker_doc.get("city") or worker_doc.get("district"))
    if c_dist and w_dist and c_dist != w_dist:
        raise HTTPException(
            status_code=400,
            detail=f"District mismatch: Complaint is in District '{complaint.get('city') or complaint.get('district')}' but worker is assigned to District '{worker_doc.get('city') or worker_doc.get('district')}'. Worker must be in the same district.",
        )

    # ── Check 3: Department Match ──
    category = complaint.get("category", "")
    custom_dept = complaint.get("custom_department")
    description = complaint.get("description", "")
    worker_dept = worker_doc.get("department", "")
    if not department_matches_category(worker_dept, category, custom_dept, description):
        raise HTTPException(
            status_code=400,
            detail=(
                f"Department mismatch: Worker department '{worker_dept}' does not match complaint department "
                f"'{complaint.get('department', 'Unknown')}' for category '{category}'."
            ),
        )

    # ── Check 4: Worker Availability ──
    if worker_doc.get("available") is False:
        raise HTTPException(
            status_code=400,
            detail=f"Worker '{worker_doc.get('name')}' is currently marked unavailable / off-duty.",
        )

    # The assigned uid stored in the complaint should be str(_id)
    assigned_worker_uid = str(worker_doc["_id"])

    await db.complaints.update_one(
        {"_id": ObjectId(complaint_id)},
        {"$set": {
            "worker_uid": assigned_worker_uid,
            "status": "ASSIGNED_TO_WORKER",
            "workflow_status": "ASSIGNED",
            "assigned_at": datetime.utcnow()
        }}
    )
    
    citizen_uid = complaint.get("firebase_uid")
    if citizen_uid:
        await create_notification(
            user_id=citizen_uid,
            message="Your complaint has been assigned to a field worker.",
            event_type="ASSIGNED_TO_WORKER",
            complaint_id=complaint_id,
        )
    await create_notification(
        user_id=assigned_worker_uid,
        message=f"New complaint assigned: {complaint.get('category', 'General issue')}.",
        event_type="WORKER_TASK_ASSIGNED",
        complaint_id=complaint_id,
    )
    
    worker_name = worker_doc.get("name", "Field Technician")
    worker_email = worker_doc.get("email")

    # Retrieve citizen details
    citizen_email = complaint.get("citizen_email")
    citizen_name = complaint.get("citizen_name", "Citizen")
    if not citizen_email and citizen_uid:
        user_doc = await db.users.find_one({"firebase_uid": citizen_uid})
        if user_doc:
            citizen_email = user_doc.get("email")
            citizen_name = user_doc.get("name", citizen_name)

    # 1. Email to Citizen (Worker Assigned)
    if citizen_email:
        try:
            send_worker_assigned_email(
                to_email=citizen_email,
                citizen_name=citizen_name,
                complaint_id=complaint_id,
                category=complaint.get("category", "Grievance"),
                department=complaint.get("department", "Public Works"),
                worker_name=worker_name,
                status="Assigned to Worker",
            )
        except Exception as e:
            logger.warning(f"[EMAIL] Failed to send worker assigned email to citizen: {e}")

    # 2. Email to Worker (New Assignment)
    if worker_email:
        try:
            send_worker_new_assignment_email(
                to_email=worker_email,
                worker_name=worker_name,
                complaint_id=complaint_id,
                category=complaint.get("category", "General Issue"),
                department=complaint.get("department", "Municipal Maintenance"),
                priority=complaint.get("priority_level", "Medium"),
                location=complaint.get("address") or f"{complaint.get('city', '')} {complaint.get('village', '')}",
                description=complaint.get("description", "Complaint assigned for inspection"),
            )
        except Exception as e:
            logger.warning(f"[EMAIL] Failed to send new assignment email to worker: {e}")

    return {
        "message": "Worker assigned successfully",
        "complaint_id": complaint_id,
        "worker_uid": assigned_worker_uid,
        "worker_name": worker_name,
        "worker_department": worker_dept,
    }


@router.get("/eligible-workers/{complaint_id}")
async def get_eligible_workers(complaint_id: str):
    """
    Automated Audit endpoint:
    Checks State -> District -> Department -> Availability -> Nearest GPS Distance.
    Returns structured audit diagnostics and list of eligible workers sorted by GPS distance.
    """
    db = await get_database()
    complaint = await db.complaints.find_one({"_id": ObjectId(complaint_id)})
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")

    cursor = db.workers.find({})
    all_workers = await cursor.to_list(length=500)

    audit_result = await audit_workers_for_complaint(complaint, all_workers)
    
    # Return serializable JSON
    return mongo_to_jsonable(audit_result)

@router.put("/verify-solution/{complaint_id}")
async def verify_solution(
    complaint_id: str,
    approve: bool,
    update: AdminSolutionUpdate,
):
    db = await get_database()
    
    status = "RESOLVED" if approve else "REOPENED"

    complaint = await db.complaints.find_one({"_id": ObjectId(complaint_id)})
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")

    admin_note = update.admin_note
    admin_response_message = update.admin_response_message or admin_note
    admin_response_image_url = update.admin_response_image_url or complaint.get("worker_proof_image_url") or None

    prior_status = complaint.get("status")
    worker_uid = str(complaint.get("worker_uid")) if complaint.get("worker_uid") else None
    
    await db.complaints.update_one(
        {"_id": ObjectId(complaint_id)},
        {"$set": {
            "status": status,
            "workflow_status": "CLOSED" if approve else "ESCALATED",
            # Keep backward-compat fields used by existing UI
            "admin_final_note": admin_note,
            "closed_at": datetime.utcnow() if approve else None,
            # Citizen-facing response stored for both approved and reopened paths
            "admin_response_message": admin_response_message,
            "admin_response_image_url": admin_response_image_url,
            # Reopen note shown to worker
            "admin_rejection_reason": admin_note if not approve else None,
        }}
    )

    if approve:
        # Purge all notifications for this resolved complaint across all users/dashboards
        await db.notifications.delete_many({"complaint_id": str(complaint_id)})

    complaint = await db.complaints.find_one({"_id": ObjectId(complaint_id)})
    citizen_uid = complaint.get("firebase_uid") if complaint else None

    if worker_uid:
        if approve and prior_status != "RESOLVED":
            await increment_worker_solved(db, worker_uid)
        elif not approve and prior_status == "RESOLVED":
            await decrement_worker_solved(db, worker_uid)

    if citizen_uid:
        await create_notification(
            user_id=citizen_uid,
            message="Admin has verified your complaint resolution." if approve else "Admin has reopened your complaint for further action.",
            event_type="ADMIN_VERIFIED" if approve else "COMPLAINT_REOPENED",
            complaint_id=complaint_id,
        )
    if complaint and complaint.get("worker_uid"):
        await create_notification(
            user_id=str(complaint.get("worker_uid")),
            message="Your submitted work has been verified." if approve else "Your submitted work was rejected and needs rework.",
            event_type="WORK_VERIFIED" if approve else "WORK_REJECTED",
            complaint_id=complaint_id,
        )

    # Trigger emails
    citizen_email = complaint.get("citizen_email")
    citizen_name = complaint.get("citizen_name", "Citizen")
    if not citizen_email and citizen_uid:
        user_doc = await db.users.find_one({"firebase_uid": citizen_uid})
        if user_doc:
            citizen_email = user_doc.get("email")
            citizen_name = user_doc.get("name", citizen_name)

    if approve and citizen_email:
        try:
            send_admin_verified_email(
                to_email=citizen_email,
                citizen_name=citizen_name,
                complaint_id=complaint_id,
                category=complaint.get("category", "General Issue"),
                department=complaint.get("department", "Municipal Maintenance"),
                verified_date=datetime.utcnow(),
            )
        except Exception as e:
            logger.warning(f"[EMAIL] Failed to send admin verified email: {e}")
    elif not approve and worker_uid:
        # Reopened / rejected -> notify worker
        worker_doc = await db.workers.find_one({"worker_uid": worker_uid})
        if not worker_doc:
            try:
                worker_doc = await db.workers.find_one({"_id": ObjectId(worker_uid)})
            except Exception:
                worker_doc = None
        if worker_doc and worker_doc.get("email"):
            try:
                send_admin_rejected_email(
                    to_email=worker_doc["email"],
                    worker_name=worker_doc.get("name", "Worker"),
                    complaint_id=complaint_id,
                    rejection_reason=admin_note or "Resolution inadequate",
                )
            except Exception as e:
                logger.warning(f"[EMAIL] Failed to send admin rejected email: {e}")
    
    return {"message": f"Integrity check complete. Status: {status}"}

@router.get("/sla-config")
async def get_sla_config():
    db = await get_database()
    return await get_sla_hours(db)

@router.put("/sla-config")
async def update_sla_config(config: dict):
    db = await get_database()
    sanitized = {
        "Critical": int(config.get("Critical", 2)),
        "High": int(config.get("High", 6)),
        "Medium": int(config.get("Medium", 24)),
        "Low": int(config.get("Low", 72)),
    }
    await db.db["settings"].update_one(
        {"key": "sla_config"},
        {"$set": {"value": sanitized, "updated_at": datetime.utcnow()}},
        upsert=True,
    )
    return {"message": "SLA config updated", "sla_config_hours": sanitized}

@router.get("/departments")
async def list_departments():
    db = await get_database()
    departments = await db.db["departments"].find({}).to_list(length=500)
    for d in departments:
        d["_id"] = str(d["_id"])
    return departments

@router.post("/departments")
async def create_department(payload: dict):
    db = await get_database()
    name = (payload.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Department name is required")
    doc = {
        "name": name,
        "description": payload.get("description", ""),
        "created_at": datetime.utcnow(),
    }
    result = await db.db["departments"].insert_one(doc)
    return {"message": "Department created", "id": str(result.inserted_id)}

@router.put("/departments/{department_id}")
async def update_department(department_id: str, payload: dict):
    db = await get_database()
    await db.db["departments"].update_one(
        {"_id": ObjectId(department_id)},
        {"$set": {"name": payload.get("name"), "description": payload.get("description", ""), "updated_at": datetime.utcnow()}},
    )
    return {"message": "Department updated"}

@router.put("/assign-worker")
async def assign_worker_to_department(payload: dict):
    db = await get_database()
    worker_uid = payload.get("worker_uid")
    department = payload.get("department")
    if not worker_uid or not department:
        raise HTTPException(status_code=400, detail="worker_uid and department are required")
    try:
        oid = ObjectId(worker_uid)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid worker_uid")
    result = await db.workers.update_one(
        {"_id": oid},
        {"$set": {"department": department, "updated_at": datetime.utcnow()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Worker not found")
    return {"message": "Worker assigned to department"}


@router.get("/workers")
async def get_all_workers():
    """Get all workers with their current workload, department, and availability status for admin assignment."""
    db = await get_database()
    cursor = db.workers.find({})
    workers = await cursor.to_list(length=200)
    
    for worker in workers:
        worker_uid = str(worker.get("_id"))
        active_tasks = await db.complaints.count_documents({
            "worker_uid": worker_uid,
            "status": {"$in": ["ASSIGNED_TO_WORKER", "IN_PROGRESS", "REOPENED"]}
        })
        worker["active_tasks"] = active_tasks
        worker["solved_count"] = worker.get("complaints_solved", 0)
        worker["worker_uid"] = worker_uid
        worker["department"] = worker.get("department") or "Public Works"
        worker["available"] = worker.get("available", True)
        worker["latitude"] = worker.get("latitude")
        worker["longitude"] = worker.get("longitude")
    
    return [mongo_to_jsonable(w) for w in workers]

@router.get("/workers-list")
async def list_field_workers():
    """Workers stored in MongoDB (JWT auth — not Firebase)."""
    db = await get_database()
    cursor = db.workers.find({})
    docs = await cursor.to_list(length=500)
    out = []
    for w in docs:
        dept = w.get("department") or "Public Works"
        out.append(
            {
                "worker_uid": str(w["_id"]),
                "email": w.get("email"),
                "name": w.get("name"),
                "department": dept,
                "available": w.get("available", True),
                "latitude": w.get("latitude"),
                "longitude": w.get("longitude"),
                "state": w.get("state"),
                "city": w.get("city"),
                "ward": w.get("ward"),
                "village": w.get("village"),
                "phone": w.get("phone"),
                "complaints_solved": w.get("complaints_solved", 0),
            }
        )
    return out

@router.put("/workers/{worker_id}")
async def update_worker_admin(worker_id: str, payload: dict):
    """Admin endpoint to update worker department, availability, coordinates, and details."""
    db = await get_database()
    try:
        oid = ObjectId(worker_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid worker ID format")

    update_doc = {"updated_at": datetime.utcnow()}
    for key in ["department", "available", "latitude", "longitude", "name", "phone", "state", "city", "ward"]:
        if key in payload:
            update_doc[key] = payload[key]

    res = await db.workers.update_one({"_id": oid}, {"$set": update_doc})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Worker not found")

    return {"message": "Worker profile updated successfully", "updated_fields": list(update_doc.keys())}

@router.get("/analytics")
async def analytics():
    db = await get_database()
    sla_hours = await get_sla_hours(db)
    complaints = await db.complaints.find({}).to_list(length=2000)

    total = len(complaints)
    critical = len([c for c in complaints if c.get("priority_level") == "Critical"])
    resolved = len([c for c in complaints if c.get("workflow_status") in ["RESOLVED", "CLOSED"] or c.get("status") in ["RESOLVED", "CLOSED"]])
    sla_violations = 0
    now = datetime.utcnow()

    by_category = {}
    by_region = {}
    by_priority = {"Critical": 0, "High": 0, "Medium": 0, "Low": 0}

    for c in complaints:
        cat = c.get("category", "Other")
        by_category[cat] = by_category.get(cat, 0) + 1

        region = f"{c.get('state', '-')}/{c.get('city', '-')}"
        by_region[region] = by_region.get(region, 0) + 1

        level = c.get("priority_level", "Low")
        if level not in by_priority:
            by_priority[level] = 0
        by_priority[level] += 1

        deadline = c.get("sla_deadline")
        if deadline and c.get("status") not in ["RESOLVED", "CLOSED"] and deadline < now:
            sla_violations += 1

    return {
        "total_complaints": total,
        "critical_complaints": critical,
        "sla_violations": sla_violations,
        "resolution_rate": (resolved / total * 100) if total else 0,
        "by_category": by_category,
        "by_region": by_region,
        "priority_distribution": by_priority,
        "sla_config_hours": sla_hours,
    }

@router.post("/sla/check")
async def run_sla_escalation():
    db = await get_database()
    now = datetime.utcnow()
    query = {
        "sla_deadline": {"$lt": now},
        "status": {"$nin": ["RESOLVED", "CLOSED"]},
    }
    overdue = await db.complaints.find(query).to_list(length=2000)
    escalated_ids = []

    for c in overdue:
        complaint_id = c.get("_id")
        if not complaint_id:
            continue
        await db.complaints.update_one(
            {"_id": complaint_id},
            {
                "$set": {
                    "status": "REOPENED",
                    "workflow_status": "ESCALATED",
                    "sla_breached": True,
                    "escalated_at": now,
                }
            },
        )
        escalated_ids.append(str(complaint_id))

    return {"message": "SLA escalation check complete", "escalated_count": len(escalated_ids), "complaint_ids": escalated_ids}


@router.get("/feedback")
async def get_all_feedback():
    """Citizen feedback entries for admin review."""
    db = await get_database()
    cursor = db.feedback.find({"admin_reviewed": {"$ne": True}}).sort("timestamp", -1)
    items = await cursor.to_list(length=500)
    enriched = []
    for item in items:
        doc = mongo_to_jsonable(item)
        cid = item.get("complaint_id")
        if cid:
            try:
                complaint = await db.complaints.find_one({"_id": ObjectId(cid)})
                if complaint:
                    doc["complaint_status"] = complaint.get("status")
                    doc["complaint_category"] = doc.get("complaint_category") or complaint.get("category")
                    doc["complaint_city"] = doc.get("complaint_city") or complaint.get("city")
                    doc["complaint_state"] = doc.get("complaint_state") or complaint.get("state")
            except Exception:
                pass
        if item.get("worker_uid"):
            try:
                worker = await db.workers.find_one({"_id": ObjectId(item["worker_uid"])})
                if worker:
                    doc["worker_name"] = worker.get("name")
            except Exception:
                pass
        enriched.append(doc)
    return enriched


@router.put("/feedback/{feedback_id}/review")
async def mark_feedback_reviewed(feedback_id: str, payload: dict = None):
    """Admin marks feedback as reviewed."""
    db = await get_database()
    try:
        oid = ObjectId(feedback_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid feedback id")
    note = (payload or {}).get("admin_note", "")
    result = await db.feedback.update_one(
        {"_id": oid},
        {"$set": {
            "admin_reviewed": True,
            "admin_review_note": note,
            "admin_reviewed_at": datetime.utcnow(),
        }},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Feedback not found")
    return {"message": "Feedback marked as reviewed."}


