"""Map citizen complaint categories to departments and worker duty positions."""

CATEGORY_TO_DEPARTMENT = {
    "electricity issue": "Electricity",
    "street light problem": "Electricity",
    "water supply problem": "Water Board",
    "drainage / cleaning": "Water Board",
    "drainage issue": "Water Board",
    "road damage / potholes": "Public Works",
    "public transport issue": "Public Works",
    "garbage / sanitation": "Public Works",
    "pension / welfare": "Public Works",
    "noise pollution": "Public Works",
    "other": "Public Works",
    "hospital / health emergency": "Health Dept",
    "health": "Health Dept",
    "women safety issue": "Police Dept",
    "public store / ration": "Ration Dept",
    "ration / food supply": "Ration Dept",
}

CATEGORY_TO_DUTY = {
    "electricity issue": "Electricity",
    "water supply problem": "Water",
    "road damage / potholes": "Road",
    "garbage / sanitation": "Panchayat",
    "street light problem": "Electricity",
    "drainage / cleaning": "Water",
    "drainage issue": "Water",
    "pension / welfare": "Panchayat",
    "public store / ration": "Ration",
    "hospital / health emergency": "Hospital",
    "ration / food supply": "Ration",
    "public transport issue": "Road",
    "women safety issue": "Women Safety",
    "noise pollution": "Panchayat",
    "other": "Other",
}

DUTY_TO_DEPARTMENT = {
    "Road": "Public Works",
    "Panchayat": "Public Works",
    "Other": "Public Works",
    "Pension": "Public Works",
    "Water": "Water Board",
    "Electricity": "Electricity",
    "Hospital": "Health Dept",
    "Health": "Health Dept",
    "Women Safety": "Police Dept",
    "Ration": "Ration Dept",
}

DUTY_SCORING_KEY = {
    "Electricity": "electricity",
    "Water": "water",
    "Road": "road",
    "Hospital": "hospital",
    "Women Safety": "women safety",
    "Ration": "ration",
    "Panchayat": "other",
    "Other": "other",
}


def _norm(s: str) -> str:
    return (s or "").strip().lower()


def resolve_operational_department(category: str, custom_department: str = None, description: str = None) -> dict:
    """
    Intelligently determines operational department, duty, and scoring key from category,
    custom department (when user selects 'Other'), and complaint description.
    
    Example:
      category="Other", custom_department="Drainage Department" -> department="Water Board", duty="Water"
    """
    text = f"{category or ''} {custom_department or ''} {description or ''}".lower()
    
    # 1. Direct match on custom_department if provided
    cd = _norm(custom_department)
    if cd:
        # Water / Drainage / Sewage
        if any(w in cd for w in ["water", "drain", "sewag", "pipe", "tap", "leak", "gutter", "borewell", "manhole", "sanitat"]):
            return {"department": "Water Board", "duty": "Water", "scoring_key": "water"}
        # Electricity / Power
        if any(w in cd for w in ["electr", "power", "light", "transformer", "wire", "current", "pole", "fuse", "eb"]):
            return {"department": "Electricity", "duty": "Electricity", "scoring_key": "electricity"}
        # Public Works / Road / Waste
        if any(w in cd for w in ["road", "pothole", "tar", "bridge", "highway", "traffic", "footpath", "garbage", "trash", "waste", "panchayat", "pension", "welfare", "cleaning"]):
            is_road = any(w in cd for w in ["road", "pothole", "tar", "bridge", "highway", "traffic", "footpath"])
            return {"department": "Public Works", "duty": "Road" if is_road else "Panchayat", "scoring_key": "road" if is_road else "other"}
        # Health / Hospital
        if any(w in cd for w in ["health", "hosp", "medic", "clinic", "doctor", "ambulance", "disease"]):
            return {"department": "Health Dept", "duty": "Hospital", "scoring_key": "hospital"}
        # Police / Women Safety
        if any(w in cd for w in ["police", "safety", "crime", "women", "theft", "harass", "security"]):
            return {"department": "Police Dept", "duty": "Women Safety", "scoring_key": "women safety"}
        # Ration / Food
        if any(w in cd for w in ["ration", "food", "pds", "grain", "rice", "store", "civil"]):
            return {"department": "Ration Dept", "duty": "Ration", "scoring_key": "ration"}

    # 2. Standard Category mapping
    cat_norm = _norm(category)
    if cat_norm and cat_norm != "other":
        dept = CATEGORY_TO_DEPARTMENT.get(cat_norm)
        if not dept:
            for key, d in CATEGORY_TO_DEPARTMENT.items():
                if key in cat_norm or cat_norm in key:
                    dept = d
                    break
        duty = CATEGORY_TO_DUTY.get(cat_norm)
        if not duty:
            for key, du in CATEGORY_TO_DUTY.items():
                if key in cat_norm or cat_norm in key:
                    duty = du
                    break
        dept = dept or DUTY_TO_DEPARTMENT.get(duty or "Other", "Public Works")
        duty = duty or "Other"
        scoring_key = DUTY_SCORING_KEY.get(duty, "other")
        return {"department": dept, "duty": duty, "scoring_key": scoring_key}

    # 3. Fallback scan on full text (description + custom dept)
    if any(w in text for w in ["water", "drain", "sewag", "pipeline", "tap", "leakage", "gutter", "drinking water", "borewell"]):
        return {"department": "Water Board", "duty": "Water", "scoring_key": "water"}
    if any(w in text for w in ["electricity", "power cut", "street light", "transformer", "wire broken", "electric shock", "no power", "eb"]):
        return {"department": "Electricity", "duty": "Electricity", "scoring_key": "electricity"}
    if any(w in text for w in ["hospital", "ambulance", "doctor", "medical", "clinic", "health", "bleeding", "patient"]):
        return {"department": "Health Dept", "duty": "Hospital", "scoring_key": "hospital"}
    if any(w in text for w in ["police", "women safety", "harassment", "theft", "attack", "threat", "eve teasing"]):
        return {"department": "Police Dept", "duty": "Women Safety", "scoring_key": "women safety"}
    if any(w in text for w in ["ration", "fair price", "pds", "food supply", "ration shop"]):
        return {"department": "Ration Dept", "duty": "Ration", "scoring_key": "ration"}
    if any(w in text for w in ["pothole", "road", "tar", "bridge", "garbage", "trash", "waste", "panchayat", "pension"]):
        return {"department": "Public Works", "duty": "Road", "scoring_key": "road"}

    return {"department": "Public Works", "duty": "Other", "scoring_key": "other"}


def category_to_department(category: str, custom_department: str = None, description: str = None) -> str:
    res = resolve_operational_department(category, custom_department, description)
    return res["department"]


def category_to_duty(category: str, custom_department: str = None, description: str = None) -> str:
    res = resolve_operational_department(category, custom_department, description)
    return res["duty"]


def department_matches_category(department: str, category: str, custom_department: str = None, description: str = None) -> bool:
    if not department:
        return True
    d = _norm(department)
    res = resolve_operational_department(category, custom_department, description)
    target_dept = _norm(res["department"])
    target_duty = _norm(res["duty"])

    if d == target_dept or d == target_duty:
        return True
    if "public works" in d and (target_dept in ("public works", "municipal") or target_duty in ("road", "panchayat", "other", "pension")):
        return True
    if "water" in d and ("water" in target_dept or target_duty == "water"):
        return True
    if "electr" in d and ("electr" in target_dept or target_duty == "electricity"):
        return True
    if "health" in d or "hosp" in d:
        return "health" in target_dept or target_duty == "hospital"
    if "police" in d or "safety" in d:
        return "police" in target_dept or target_duty == "women safety"
    if "ration" in d:
        return "ration" in target_dept or target_duty == "ration"
    return False


def duty_matches_category(duty: str, category: str, custom_department: str = None, description: str = None) -> bool:
    if not duty:
        return True
    res = resolve_operational_department(category, custom_department, description)
    target = res["duty"]
    d = (duty or "Other").strip()
    if d.lower() == target.lower():
        return True
    if d.lower() == "panchayat" and target in ("Other", "Ration", "Road", "Pension"):
        return True
    if d.lower() == "pension" and target in ("Other", "Ration", "Panchayat"):
        return True
    if d.lower() in ("public works", "municipal") and target in ("Road", "Panchayat", "Other", "Pension"):
        return True
    if d.lower() == "other":
        return True
    return department_matches_category(duty, category, custom_department, description)


def category_scoring_key(category: str, custom_department: str = None, description: str = None) -> str:
    res = resolve_operational_department(category, custom_department, description)
    return res["scoring_key"]
