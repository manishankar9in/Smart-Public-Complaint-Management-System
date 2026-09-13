"""
Match field workers strictly by:
State Match -> District Match -> Department Match -> Availability -> Nearest GPS Distance.
"""

from typing import Any, Dict, List, Optional
from database.db import get_database
from services.category_mapping import department_matches_category
from utils.validators import calculate_distance_meters


def _norm(s: Any) -> str:
    if s is None:
        return ""
    return str(s).strip().lower()


def _get_complaint_coords(complaint: dict) -> tuple[Optional[float], Optional[float]]:
    """Extract valid latitude and longitude from complaint document."""
    lat = complaint.get("gps_lat") if complaint.get("gps_lat") is not None else complaint.get("latitude")
    lng = complaint.get("gps_long") if complaint.get("gps_long") is not None else complaint.get("longitude")
    try:
        if lat is not None and lng is not None and str(lat).strip() != "" and str(lng).strip() != "":
            return float(lat), float(lng)
    except (ValueError, TypeError):
        pass
    return None, None


def _get_worker_coords(worker: dict) -> tuple[Optional[float], Optional[float]]:
    """Extract valid latitude and longitude from worker document."""
    lat = worker.get("latitude") if worker.get("latitude") is not None else worker.get("gps_lat")
    lng = worker.get("longitude") if worker.get("longitude") is not None else worker.get("gps_long")
    try:
        if lat is not None and lng is not None and str(lat).strip() != "" and str(lng).strip() != "":
            return float(lat), float(lng)
    except (ValueError, TypeError):
        pass
    return None, None


def _location_matches(worker: dict, complaint: dict) -> bool:
    """Check if worker matches complaint state and district/city."""
    ws = _norm(worker.get("state"))
    cs = _norm(complaint.get("state"))
    if not ws or not cs or ws != cs:
        return False

    wc = _norm(worker.get("city") or worker.get("district"))
    cc = _norm(complaint.get("city") or complaint.get("district"))
    if not wc or not cc or wc != cc:
        return False

    return True


async def audit_workers_for_complaint(complaint: dict, all_workers: List[dict]) -> Dict[str, Any]:
    """
    Perform a comprehensive 5-step strict audit of workers against a complaint:
    Priority: State Match -> District Match -> Department Match -> Available Worker -> Nearest GPS Distance.
    
    Returns structured audit result including eligible workers, nearest worker, and clear failure diagnostics.
    """
    db = await get_database()
    
    category = complaint.get("category") or "General"
    custom_dept = complaint.get("custom_department")
    description = complaint.get("description", "")
    routed_dept = complaint.get("department", "")

    c_state = complaint.get("state") or ""
    c_district = complaint.get("city") or complaint.get("district") or ""
    c_lat, c_lng = _get_complaint_coords(complaint)

    complaint_info = {
        "id": str(complaint.get("_id", "")),
        "category": category,
        "custom_department": custom_dept,
        "department": routed_dept,
        "state": c_state,
        "district": c_district,
        "latitude": c_lat,
        "longitude": c_lng,
        "has_gps": c_lat is not None and c_lng is not None,
    }

    # Tracking failure diagnostics across the worker pool
    failures = {
        "no_workers_in_state": False,
        "no_workers_in_district": False,
        "no_matching_department": False,
        "no_available_workers": False,
        "missing_complaint_gps": c_lat is None or c_lng is None,
        "missing_worker_gps": False,
    }

    workers_in_state = []
    workers_in_district = []
    workers_in_dept = []
    workers_available = []

    candidates = []

    for w in all_workers:
        w_state = w.get("state") or ""
        w_district = w.get("city") or w.get("district") or ""
        w_dept = w.get("department") or ""
        is_avail = w.get("available") is not False

        # 1. State check
        if _norm(w_state) and _norm(c_state) and _norm(w_state) == _norm(c_state):
            workers_in_state.append(w)
        else:
            continue

        # 2. District check (within same state)
        if _norm(w_district) and _norm(c_district) and _norm(w_district) == _norm(c_district):
            workers_in_district.append(w)
        else:
            continue

        # 3. Department check (within same district)
        if department_matches_category(w_dept, category, custom_dept, description):
            workers_in_dept.append(w)
        else:
            continue

        # 4. Availability check (within same department)
        if is_avail:
            workers_available.append(w)
        else:
            continue

        # 5. GPS Coordinates & Distance check
        w_lat, w_lng = _get_worker_coords(w)
        if w_lat is None or w_lng is None:
            # Worker in same dept/district is missing GPS
            failures["missing_worker_gps"] = True
            continue

        if c_lat is None or c_lng is None:
            # Complaint is missing GPS
            continue

        # Calculate exact GPS distance using Haversine formula
        dist_meters = calculate_distance_meters(c_lat, c_lng, w_lat, w_lng)
        dist_km = round(dist_meters / 1000.0, 2)

        # Count active tasks from DB
        w_id_str = str(w.get("_id", w.get("worker_uid", "")))
        active_count = 0
        if db is not None and w_id_str:
            try:
                active_count = await db.complaints.count_documents({
                    "worker_uid": w_id_str,
                    "status": {"$in": ["ASSIGNED_TO_WORKER", "IN_PROGRESS", "REOPENED"]},
                })
            except Exception:
                active_count = w.get("active_tasks", 0)
        else:
            active_count = w.get("active_tasks", 0)

        candidate = {
            "worker_uid": w_id_str,
            "_id": w_id_str,
            "name": w.get("name") or "Field Technician",
            "email": w.get("email") or "",
            "phone": w.get("phone") or "",
            "department": w_dept or "Public Works",
            "state": w_state,
            "district": w_district,
            "city": w_district,
            "ward": w.get("ward") or "",
            "latitude": w_lat,
            "longitude": w_lng,
            "distance_km": dist_km,
            "distance_meters": round(dist_meters, 1),
            "available": True,
            "active_tasks": active_count,
            "complaints_solved": w.get("complaints_solved", 0),
            "assignment_status": "Eligible",
        }
        candidates.append(candidate)

    # Compile failure diagnostics if candidates list is empty
    failure_reasons: List[str] = []

    if not candidates:
        if not c_state:
            failure_reasons.append("Complaint is missing State information.")
        elif not workers_in_state:
            failure_reasons.append(f"No workers registered in State '{c_state}'.")
        
        if not c_district:
            failure_reasons.append("Complaint is missing District / City information.")
        elif workers_in_state and not workers_in_district:
            failure_reasons.append(f"No worker registered in District '{c_district}', {c_state}.")

        if workers_in_district and not workers_in_dept:
            dept_name = routed_dept or category
            failure_reasons.append(f"No worker found in '{dept_name}' department for District '{c_district}'.")

        if workers_in_dept and not workers_available:
            failure_reasons.append(f"All matching workers in '{c_district}' are currently unavailable / off-duty.")

        if workers_available:
            if c_lat is None or c_lng is None:
                failure_reasons.append("Missing complaint GPS location (Latitude/Longitude).")
            if failures["missing_worker_gps"]:
                failure_reasons.append("Available workers in this district are missing valid GPS coordinates.")

        if not failure_reasons:
            failure_reasons.append("No eligible worker found for this complaint.")

    # Sort candidates strictly: Nearest GPS distance first, then fewest active tasks
    candidates.sort(key=lambda w: (w["distance_km"], w["active_tasks"]))

    nearest_worker = None
    if candidates:
        nearest_worker = candidates[0]
        nearest_worker["is_nearest"] = True
        nearest_worker["assignment_status"] = f"Eligible (Nearest - {nearest_worker['distance_km']} km)"

    summary = ""
    if candidates:
        summary = f"Found {len(candidates)} eligible worker(s) in {c_district}, {c_state}. Nearest: {nearest_worker['name']} ({nearest_worker['distance_km']} km away)."
    else:
        summary = "No eligible worker found for this complaint."

    return {
        "complaint": complaint_info,
        "audit_passed": len(candidates) > 0,
        "eligible_workers": candidates,
        "nearest_worker": nearest_worker,
        "failure_reasons": failure_reasons,
        "summary": summary,
    }


async def find_best_worker(complaint: dict) -> Optional[str]:
    """
    Finds the single best eligible worker using strict hierarchy:
    State Match -> District Match -> Department Match -> Availability -> Shortest GPS Distance.
    Returns worker MongoDB _id as string, or None if no worker qualifies.
    """
    db = await get_database()
    cursor = db.workers.find({})
    all_workers = await cursor.to_list(length=500)

    audit_result = await audit_workers_for_complaint(complaint, all_workers)
    if audit_result["audit_passed"] and audit_result["nearest_worker"]:
        return str(audit_result["nearest_worker"]["worker_uid"])

    return None
