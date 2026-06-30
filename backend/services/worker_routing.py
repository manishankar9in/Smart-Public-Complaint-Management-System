"""Match field workers by duty (category) + location."""
from database.db import get_database
from services.category_mapping import duty_matches_category


def _norm(s) -> str:
    if s is None:
        return ""
    return str(s).strip().lower()


def _location_matches(worker: dict, complaint: dict) -> bool:
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


def _score_worker(worker: dict, complaint: dict) -> int:
    score = 0
    if _location_matches(worker, complaint):
        score += 5
    cw = _norm(complaint.get("ward"))
    ww = _norm(worker.get("ward"))
    if cw and ww and cw == ww:
        score += 4
    cv = _norm(complaint.get("village"))
    wv = _norm(worker.get("village")) or _norm(worker.get("city"))
    if cv and wv and (cv == wv or cv in wv or wv in cv):
        score += 3
    return score


async def find_best_worker(complaint: dict):
    """Returns worker MongoDB _id as string, or None."""
    db = await get_database()
    category = complaint.get("category") or "Other"

    cursor = db.workers.find({})
    all_workers = await cursor.to_list(length=500)

    candidates = []
    for w in all_workers:
        duty = w.get("duty_position") or "Other"
        if not duty_matches_category(duty, category):
            continue
        if not _location_matches(w, complaint):
            continue
        candidates.append(w)

    if candidates:
        candidates.sort(key=lambda w: _score_worker(w, complaint), reverse=True)
        return str(candidates[0]["_id"])

    return None
