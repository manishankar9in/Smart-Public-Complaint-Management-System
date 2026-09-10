"""
Match field workers by Department / Duty + Availability + Location / GPS coordinates.
"""

from database.db import get_database
from services.category_mapping import department_matches_category, duty_matches_category
from utils.validators import calculate_distance_meters


def _norm(s) -> str:
    if s is None:
        return ""
    return str(s).strip().lower()


def _location_matches(worker: dict, complaint: dict) -> bool:
    # If GPS coordinates are present on both, check proximity (<= 50km)
    w_lat = worker.get("latitude") or worker.get("gps_lat")
    w_lng = worker.get("longitude") or worker.get("gps_long")
    c_lat = complaint.get("gps_lat") or complaint.get("latitude")
    c_lng = complaint.get("gps_long") or complaint.get("longitude")

    if w_lat is not None and w_lng is not None and c_lat is not None and c_lng is not None:
        try:
            dist_m = calculate_distance_meters(float(c_lat), float(c_lng), float(w_lat), float(w_lng))
            if dist_m <= 100000:  # Within 100km radius
                return True
        except Exception:
            pass

    # Fallback to string-based state/city/ward matching
    ws = _norm(worker.get("state"))
    wc = _norm(worker.get("city"))
    ww = _norm(worker.get("ward"))
    cs = _norm(complaint.get("state"))
    cc = _norm(complaint.get("city"))
    cv = _norm(complaint.get("village"))
    ca = _norm(complaint.get("address"))
    loc = f"{cs} {cc} {cv} {ca}"

    if not ws or ws == "general":
        area = wc or ww
        if not area:
            return True
        return area in loc or cc in area or cv in area or area in cc

    if cs and ws != cs:
        return False
    if cc and wc and wc != cc:
        if ww and (ww in cv or ww in ca or ww == cv):
            return True
        return False
    return True


def _score_worker(worker: dict, complaint: dict) -> float:
    score = 0.0

    # 1. Availability check (highest priority)
    if worker.get("available") is False:
        return -1000.0

    # 2. Department match score
    category = complaint.get("category", "")
    w_dept = worker.get("department")

    if w_dept and department_matches_category(w_dept, category):
        score += 30.0

    # 3. GPS Distance proximity scoring
    w_lat = worker.get("latitude") or worker.get("gps_lat")
    w_lng = worker.get("longitude") or worker.get("gps_long")
    c_lat = complaint.get("gps_lat") or complaint.get("latitude")
    c_lng = complaint.get("gps_long") or complaint.get("longitude")

    if w_lat is not None and w_lng is not None and c_lat is not None and c_lng is not None:
        try:
            dist_m = calculate_distance_meters(float(c_lat), float(c_lng), float(w_lat), float(w_lng))
            # Distance bonus: closer gets up to 30 points
            dist_km = dist_m / 1000.0
            proximity_bonus = max(0.0, 30.0 - (dist_km * 0.5))
            score += proximity_bonus
        except Exception:
            pass

    # 4. Location string matching
    if _location_matches(worker, complaint):
        score += 10.0
    cw = _norm(complaint.get("ward"))
    ww = _norm(worker.get("ward"))
    if cw and ww and cw == ww:
        score += 8.0
    cv = _norm(complaint.get("village"))
    wv = _norm(worker.get("village")) or _norm(worker.get("city"))
    if cv and wv and (cv == wv or cv in wv or wv in cv):
        score += 5.0

    # 5. Workload penalty (fewer active tasks is better)
    active_tasks = worker.get("active_tasks", 0)
    score -= (active_tasks * 5.0)

    return score


async def find_best_worker(complaint: dict):
    """Returns worker MongoDB _id as string, or None."""
    db = await get_database()
    category = complaint.get("category") or "Other"

    cursor = db.workers.find({})
    all_workers = await cursor.to_list(length=500)

    candidates = []
    for w in all_workers:
        # Check availability
        if w.get("available") is False:
            continue

        dept = w.get("department")
        if not dept or not department_matches_category(dept, category):
            continue

        if not _location_matches(w, complaint):
            continue

        # Count active tasks
        active_count = await db.complaints.count_documents({
            "worker_uid": str(w["_id"]),
            "status": {"$in": ["ASSIGNED_TO_WORKER", "IN_PROGRESS", "REOPENED"]},
        })
        w["active_tasks"] = active_count

        candidates.append(w)

    # Fallback 1: General maintenance / Public Works worker in the same area
    if not candidates:
        for w in all_workers:
            if w.get("available") is False:
                continue
            if not _location_matches(w, complaint):
                continue
            dept = (w.get("department") or "").lower()
            if "public works" in dept or "municipal" in dept or "general" in dept:
                active_count = await db.complaints.count_documents({
                    "worker_uid": str(w["_id"]),
                    "status": {"$in": ["ASSIGNED_TO_WORKER", "IN_PROGRESS", "REOPENED"]},
                })
                w["active_tasks"] = active_count
                candidates.append(w)

    # Fallback 2: Any available worker in the area
    if not candidates:
        for w in all_workers:
            if w.get("available") is False:
                continue
            if not _location_matches(w, complaint):
                continue
            active_count = await db.complaints.count_documents({
                "worker_uid": str(w["_id"]),
                "status": {"$in": ["ASSIGNED_TO_WORKER", "IN_PROGRESS", "REOPENED"]},
            })
            w["active_tasks"] = active_count
            candidates.append(w)

    if candidates:
        candidates.sort(key=lambda w: _score_worker(w, complaint), reverse=True)
        return str(candidates[0]["_id"])

    return None
