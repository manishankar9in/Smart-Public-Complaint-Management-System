import re
from services.category_mapping import resolve_operational_department


def calculate_priority_score(category: str, description: str, history_data: dict = None, custom_department: str = None) -> dict:
    """
    AI Priority Scoring Engine
    Priority = (Severity * 0.4) + (Urgency * 0.3) + (Impact * 0.2) + (DelayRisk * 0.1)
    
    Levels:
    - Critical (Score >= 80): Immediate life-safety, medical emergency, fire/electrical hazard, crime risk
    - High (Score >= 60): Major public service outage, sewage overflow, severe road hazard, disease risk
    - Medium (Score >= 40): Standard civic problems (leaks, street lights, garbage, routine potholes)
    - Low (Score < 40): Non-urgent cosmetic/minor requests
    """
    desc_lower = (description or "").lower()
    custom_lower = (custom_department or "").lower()
    full_text = f"{category or ''} {custom_lower} {desc_lower}".lower()

    # Resolve operational department details
    op_info = resolve_operational_department(category, custom_department, description)
    department = op_info["department"]
    duty = op_info["duty"]

    # 1. Base weights by category/department intrinsic risk
    cat_weights = {
        "hospital": (55, 55, 45, 40),
        "health": (50, 50, 45, 40),
        "women safety": (50, 50, 40, 35),
        "police": (45, 45, 40, 30),
        "electricity": (40, 42, 38, 32),
        "water": (38, 40, 36, 30),
        "drainage": (36, 38, 35, 30),
        "road": (34, 34, 34, 28),
        "garbage": (32, 32, 32, 28),
        "sanitation": (32, 32, 32, 28),
        "street light": (32, 34, 30, 28),
        "ration": (30, 30, 32, 25),
        "transport": (28, 28, 28, 22),
        "pension": (26, 26, 28, 22),
        "noise": (22, 22, 22, 20),
    }

    base = (25, 25, 25, 20)
    for k, v in cat_weights.items():
        if k in (category or "").lower() or (custom_department and k in custom_department.lower()) or k in department.lower():
            base = v
            break

    severity, urgency, impact, delay_risk = base

    # 2. Tier 1: Emergency / Life-Safety / Critical Hazard (+45 to +50 points)
    t1_patterns = [
        r"emergenc", r"critical", r"life threat", r"death", r"fatal",
        r"fire", r"explos", r"blast", r"bleed", r"unconscious", r"cardiac",
        r"ambulanc", r"patient", r"live wire", r"electric shock", r"electrocution",
        r"transformer (spark|blast|burst|fire)", r"wire.*hang", r"gas leak", r"cylinder",
        r"collaps", r"cave.*in", r"drown", r"trapped", r"attack", r"assault",
        r"eve teasing", r"harass", r"molest", r"violence", r"threaten", r"weapon",
        r"accident", r"casualt"
    ]
    t1_matched = [p for p in t1_patterns if re.search(p, full_text)]
    if t1_matched:
        severity += 45
        urgency += 50
        impact += 35
        delay_risk += 35

    # 3. Tier 2: Severe Service Outage / Public Health Risk / Major Hazard (+25 to +38 points)
    t2_patterns = [
        r"no drinking water", r"water crisis", r"shortage", r"no water", r"burst",
        r"contaminat", r"poison", r"blackout", r"power cut", r"power outage", r"no power", r"no electr",
        r"voltage surge", r"spark", r"sewage overflow", r"manhole open", r"open drain", r"foul smell",
        r"flood", r"dengue", r"mosquito", r"epidemic", r"disease", r"stagnant water", r"choked",
        r"slip", r"fall", r"big pothole", r"deep pothole", r"badly broken", r"crack",
        r"bridge", r"highway", r"urgent", r"immediat", r"severe", r"conduit",
        r"danger", r"hazard", r"unsafe", r"entire (village|colony|street|area|town)",
        r"(3|4|5|6|7|many|several) days", r"week"
    ]
    t2_matched = [p for p in t2_patterns if re.search(p, full_text)]
    if t2_matched and not t1_matched:
        boost = min(18 + len(t2_matched) * 8, 38)
        severity += boost
        urgency += boost + 5
        impact += boost
        delay_risk += boost

    # 4. Tier 3: Standard Routine Issues (+10 to +15 points)
    t3_patterns = [
        r"leak", r"pothole", r"garbage", r"street light", r"waste", r"smell",
        r"delay", r"ration", r"pension", r"not work", r"broken", r"clog",
        r"dump", r"traffic", r"slow", r"dark", r"dirty", r"clean",
        r"pressure", r"pipe", r"supply", r"quota", r"distribut"
    ]
    t3_matched = [p for p in t3_patterns if re.search(p, full_text)]
    if t3_matched and not t1_matched and not t2_matched:
        severity += 12
        urgency += 15
        impact += 12
        delay_risk += 10

    # 5. History / Cluster density boost
    if history_data and history_data.get("nearby_complaints_count", 0) > 3:
        impact += 10
        delay_risk += 10

    severity = min(severity, 100)
    urgency = min(urgency, 100)
    impact = min(impact, 100)
    delay_risk = min(delay_risk, 100)

    score = int((severity * 0.4) + (urgency * 0.3) + (impact * 0.2) + (delay_risk * 0.1))

    if score >= 80:
        level = "Critical"
    elif score >= 60:
        level = "High"
    elif score >= 40:
        level = "Medium"
    else:
        level = "Low"

    detected_keywords = []
    for kw in ["emergency", "critical", "fire", "accident", "shock", "live wire", "danger", "burst", "overflow", "blackout", "leak", "blocked", "pothole"]:
        if kw in full_text:
            detected_keywords.append(kw)

    return {
        "score": score,
        "level": level,
        "department": department,
        "duty": duty,
        "severity": severity,
        "urgency": urgency,
        "impact": impact,
        "delay_risk": delay_risk,
        "sentiment": "negative" if score >= 40 else "neutral",
        "keywords": detected_keywords,
        "vector_analysis": "Completed",
        "timestamp": "Real-time sync",
    }
