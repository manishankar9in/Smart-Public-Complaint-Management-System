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


def category_to_department(category: str) -> str:
    c = _norm(category) or "other"
    if c in CATEGORY_TO_DEPARTMENT:
        return CATEGORY_TO_DEPARTMENT[c]
    for key, dept in CATEGORY_TO_DEPARTMENT.items():
        if key in c or c in key:
            return dept
    duty = category_to_duty(category)
    return DUTY_TO_DEPARTMENT.get(duty, "Public Works")


def category_to_duty(category: str) -> str:
    c = _norm(category) or "other"
    if c in CATEGORY_TO_DUTY:
        return CATEGORY_TO_DUTY[c]
    for key, duty in CATEGORY_TO_DUTY.items():
        first = key.split()[0]
        if first in c or duty.lower() in c:
            return duty
    return "Other"


def department_matches_category(department: str, category: str) -> bool:
    if not department:
        return True
    d = _norm(department)
    target_dept = _norm(category_to_department(category))
    target_duty = _norm(category_to_duty(category))

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
    return False


def duty_matches_category(duty: str, category: str) -> bool:
    if not duty:
        return True
    target = category_to_duty(category)
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
    return department_matches_category(duty, category)


def category_scoring_key(category: str) -> str:
    duty = category_to_duty(category)
    return DUTY_SCORING_KEY.get(duty, "other")
