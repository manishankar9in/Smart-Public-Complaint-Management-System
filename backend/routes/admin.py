from fastapi import APIRouter, HTTPException
from database.db import get_database
from database.mongo_json import mongo_to_jsonable
from bson import ObjectId
from models.complaint import ComplaintVerifyUpdate, WorkerAssignment, AdminSolutionUpdate
from datetime import datetime, timedelta
from scoring_engine.ai_priority import calculate_priority_score
from services.worker_routing import find_best_worker

router = APIRouter()

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
async def assign_worker(complaint_id: str, worker_uid: str = None):
    db = await get_database()
    
    complaint = await db.complaints.find_one({"_id": ObjectId(complaint_id)})
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")

    # Intelligent Auto-Routing if no UID provided
    assigned_worker_uid = worker_uid or await find_best_worker(complaint)
    
    if not assigned_worker_uid:
        raise HTTPException(status_code=400, detail="No available worker in this area.")

    result = await db.complaints.update_one(
        {"_id": ObjectId(complaint_id)},
        {"$set": {
            "worker_uid": assigned_worker_uid,
            "status": "ASSIGNED_TO_WORKER",
            "workflow_status": "ASSIGNED",
            "assigned_at": datetime.utcnow()
        }}
    )
    
    return {"message": f"Mission assigned to authority: {assigned_worker_uid}"}

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
    admin_response_image_url = update.admin_response_image_url
    
    await db.complaints.update_one(
        {"_id": ObjectId(complaint_id)},
        {"$set": {
            "status": status,
            "workflow_status": "CLOSED" if approve else "ESCALATED",
            # Keep backward-compat fields used by existing UI
            "admin_final_note": admin_note,
            "closed_at": datetime.utcnow() if approve else None,
            # New fields for citizen response
            "admin_response_message": admin_response_message if approve else None,
            "admin_response_image_url": admin_response_image_url if approve else None,
            # New fields for rejection note shown to worker
            "admin_rejection_reason": admin_note if not approve else None,
        }}
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
