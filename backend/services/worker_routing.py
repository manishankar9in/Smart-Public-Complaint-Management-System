"""Match field workers from `workers` collection by duty (category) + Indian address fields."""
from database.db import get_database


def _norm(s) -> str:
    if s is None:
        return ""
    return str(s).strip().lower()


def _duty_matches_category(duty: str, category: str) -> bool:
    d = _norm(duty)
    c = _norm(category)
    if d == c:
        return True
    # Panchayat workers take general / uncategorized issues
    if d == "panchayat" and c in ("other", "ration", "road"):
        return True
    return False


def _score_worker(worker: dict, complaint: dict) -> int:
    score = 0
    cw = _norm(complaint.get("ward"))
    ww = _norm(worker.get("ward"))
    if cw and ww and cw == ww:
        score += 4
    cv = _norm(complaint.get("village"))
    wv = _norm(worker.get("village"))
    if cv and wv and cv == wv:
        score += 4
    cs = _norm(complaint.get("street"))
    ws = _norm(worker.get("street"))
    if cs and ws and cs == ws:
        score += 2
    ccity = _norm(complaint.get("city"))
    wcity = _norm(worker.get("city"))
    if ccity and wcity and ccity == wcity:
        score += 2
    return score


async def find_best_worker(complaint: dict):
    """
    Returns worker MongoDB _id as string, or None.
    Priority: duty match + state/city + ward/village/street scoring.
    """
    db = await get_database()
    category = complaint.get("category") or "Other"
    state = complaint.get("state")
    city = complaint.get("city")

    cursor = db.workers.find({})
    all_workers = await cursor.to_list(length=500)

    candidates = []
    for w in all_workers:
        duty = w.get("duty_position") or "Other"
        if not _duty_matches_category(duty, category):
            continue
        if state and _norm(w.get("state")) != _norm(state):
            continue
        if city and _norm(w.get("city")) != _norm(city):
            continue
        candidates.append(w)

    if candidates:
        candidates.sort(key=lambda w: _score_worker(w, complaint), reverse=True)
        return str(candidates[0]["_id"])

    # Fallback: same state + city, any duty matching category (relaxed city already tried)
    for w in all_workers:
        duty = w.get("duty_position") or "Other"
        if not _duty_matches_category(duty, category):
            continue
        if state and _norm(w.get("state")) != _norm(state):
            continue
        if city and _norm(w.get("city")) != _norm(city):
            continue
        return str(w["_id"])

    # Last resort: any worker in same city for duty match (ignore state typo)
    for w in all_workers:
        duty = w.get("duty_position") or "Other"
        if not _duty_matches_category(duty, category):
            continue
        if city and _norm(w.get("city")) == _norm(city):
            return str(w["_id"])

    # Absolute fallback: first worker in DB (admin should register workers)
    any_one = await db.workers.find_one({})
    return str(any_one["_id"]) if any_one else None
