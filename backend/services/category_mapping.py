"""Map citizen complaint categories to worker duty positions."""

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


def category_to_duty(category: str) -> str:
    c = _norm(category) or "other"
    if c in CATEGORY_TO_DUTY:
        return CATEGORY_TO_DUTY[c]
    for key, duty in CATEGORY_TO_DUTY.items():
        first = key.split()[0]
        if first in c or duty.lower() in c:
            return duty
    return "Other"


def duty_matches_category(duty: str, category: str) -> bool:
    target = category_to_duty(category)
    d = (duty or "Other").strip()
    if d == target:
        return True
    if d == "Panchayat" and target in ("Other", "Ration", "Road"):
        return True
    if d == "Other":
        return target == "Other"
    return False


def category_scoring_key(category: str) -> str:
    duty = category_to_duty(category)
    return DUTY_SCORING_KEY.get(duty, "other")
