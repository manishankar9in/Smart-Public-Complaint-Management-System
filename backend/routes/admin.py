from fastapi import APIRouter, Depends, HTTPException
from database.db import get_database
from database.mongo_json import mongo_to_jsonable
from bson import ObjectId
from routes.auth import get_admin_uid_from_token
from models.complaint import ComplaintVerifyUpdate, WorkerAssignment, AdminSolutionUpdate
from datetime import datetime, timedelta
from scoring_engine.ai_priority import calculate_priority_score
from services.worker_routing import find_best_worker
from services.category_mapping import duty_matches_category
from services.worker_routing import _location_matches
from services.notifications import create_notification
from services.worker_stats import increment_worker_solved, decrement_worker_solved

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
        
    # 2. AI Priority Scoring (Advanced)
    priority = calculate_priority_score(complaint["category"], complaint["description"])
    
    # 3. Update Status
    await db.complaints.update_one(
        {"_id": ObjectId(complaint_id)},
        {"$set": {
            "status": "VERIFIED",
            "workflow_status": "NEW",
            "priority_score": priority["score"],
            "priority_level": priority["level"],
            "department": priority["department"],
            "admin_note": update.admin_note,
            "verified_at": datetime.utcnow(),
            "sla_deadline": datetime.utcnow() + timedelta(hours=sla_hours.get(priority["level"], 24))
        }}
    )
    return {"message": "Complaint verified and scored.", "priority": priority["level"]}

@router.put("/assign-worker/{complaint_id}")
async def assign_worker(complaint_id: str, payload: dict = None):
    """Assign a worker to a complaint (manual or auto-assignment)."""
    db = await get_database()
    
    complaint = await db.complaints.find_one({"_id": ObjectId(complaint_id)})
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")

    # Get worker_uid from request body or use auto-assignment
    worker_uid = None
    if payload and "worker_uid" in payload:
        worker_uid = payload["worker_uid"]
    
    # Priority-based Auto-Routing if no UID provided
    if not worker_uid:
        category = complaint.get("category", "Other")
        state = complaint.get("state")
        city = complaint.get("city")

        all_workers = await db.workers.find({}).to_list(length=200)

        def _norm(val):
            return str(val or "").strip().lower()

        candidates = []
        for worker in all_workers:
            duty = worker.get("duty_position") or "Other"
            if not duty_matches_category(duty, category):
                continue
            if not _location_matches(worker, complaint):
                continue
            candidates.append(worker)

        if not candidates:
            raise HTTPException(
                status_code=400,
                detail="No worker found matching complaint category and location.",
            )

        worker_scores = []
        for worker in candidates:
            active_tasks = await db.complaints.count_documents({
                "worker_uid": str(worker["_id"]),
                "status": {"$in": ["ASSIGNED_TO_WORKER", "IN_PROGRESS", "REOPENED"]}
            })

            complaint_priority = complaint.get("priority_level", "Low")
            if complaint_priority == "Critical":
                priority_score = 100
            elif complaint_priority == "High":
                priority_score = 75
            elif complaint_priority == "Medium":
                priority_score = 50
            else:
                priority_score = 25

            duty_bonus = 20 if duty_matches_category(worker.get("duty_position") or "Other", category) else 0
            final_score = priority_score + duty_bonus - (active_tasks * 10)

            worker_scores.append({
                "worker": worker,
                "score": final_score,
                "active_tasks": active_tasks
            })

        if worker_scores:
            worker_scores.sort(key=lambda x: x["score"], reverse=True)
            assigned_worker_uid = str(worker_scores[0]["worker"]["_id"])
        else:
            assigned_worker_uid = None
    else:
        assigned_worker_uid = worker_uid
    
    if not assigned_worker_uid:
        raise HTTPException(status_code=400, detail="No available worker in this area.")

    # Verify worker exists if manual assignment
    if worker_uid:
        worker = await db.workers.find_one({"worker_uid": worker_uid})
        if not worker:
            try:
                worker = await db.workers.find_one({"_id": ObjectId(worker_uid)})
            except Exception:
                worker = None
        if not worker:
            raise HTTPException(status_code=404, detail="Worker not found")

    result = await db.complaints.update_one(
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
    
    worker_name = "Unknown"
    if worker_uid:
        worker = await db.workers.find_one({"worker_uid": worker_uid})
        worker_name = worker.get("name", "Unknown") if worker else "Unknown"
    
    return {
        "message": "Worker assigned successfully",
        "complaint_id": complaint_id,
        "worker_uid": assigned_worker_uid,
        "worker_name": worker_name
    }

@router.put("/verify-solution/{complaint_id}")
async def verify_solution(
    complaint_id: str,
    approve: bool,
    update: AdminSolutionUpdate,
):
    db = await get_database()
    
    status = "RESOLVED" if approve else "REOPENED"

    admin_note = update.admin_note
    admin_response_message = update.admin_response_message or admin_note
    admin_response_image_url = update.admin_response_image_url or None

    complaint = await db.complaints.find_one({"_id": ObjectId(complaint_id)})
    prior_status = complaint.get("status") if complaint else None
    worker_uid = str(complaint.get("worker_uid")) if complaint and complaint.get("worker_uid") else None
    
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
    """Get all workers with their current workload and solved count for admin assignment."""
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
    
    return [mongo_to_jsonable(w) for w in workers]

@router.get("/workers-list")
async def list_field_workers():
    """Workers stored in MongoDB (JWT auth — not Firebase)."""
    db = await get_database()
    cursor = db.workers.find({})
    docs = await cursor.to_list(length=500)
    out = []
    for w in docs:
        out.append(
            {
                "worker_uid": str(w["_id"]),
                "email": w.get("email"),
                "name": w.get("name"),
                "duty_position": w.get("duty_position"),
                "state": w.get("state"),
                "city": w.get("city"),
                "ward": w.get("ward"),
                "village": w.get("village"),
                "department": w.get("department"),
                "complaints_solved": w.get("complaints_solved", 0),
            }
        )
    return out

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


