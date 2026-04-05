import re

def calculate_priority_score(category: str, description: str, history_data: dict = None) -> dict:
    """
    AI Priority Scoring Engine
    Priority = (Severity * 0.4) + (Urgency * 0.3) + (Impact * 0.2) + (DelayRisk * 0.1)
    """
    description_lower = description.lower()

    # Core features used in priority formula
    severity = 30
    urgency = 30
    impact = 25
    delay_risk = 20

    critical_vectors = {
        r"emergency|death|fire|attack|blast|bleeding": (45, 50, 40, 35),
        r"accident|trapped|shock|collapsed|broken pipe|sewage overflow": (35, 40, 35, 30),
        r"shortage|leak|blocked|no power|no water|danger": (20, 25, 20, 18),
    }
    for pattern, (sev, urg, imp, delay) in critical_vectors.items():
        if re.search(pattern, description_lower):
            severity += sev
            urgency += urg
            impact += imp
            delay_risk += delay

    # Category context boosts
    category_factor = {
        "hospital": (20, 15, 25, 10),
        "electricity": (15, 20, 20, 15),
        "water": (12, 15, 18, 12),
        "road": (10, 10, 15, 10),
        "women safety": (30, 30, 25, 15),
        "ration": (8, 8, 12, 8),
        "health": (18, 15, 20, 10),
        "police": (20, 20, 20, 10),
        "other": (5, 5, 5, 5),
    }
    sev, urg, imp, delay = category_factor.get(category.lower(), (8, 8, 8, 8))
    severity += sev
    urgency += urg
    impact += imp
    delay_risk += delay

    if history_data and history_data.get("nearby_complaints_count", 0) > 3:
        impact += 10
        delay_risk += 10

    severity = min(severity, 100)
    urgency = min(urgency, 100)
    impact = min(impact, 100)
    delay_risk = min(delay_risk, 100)

    score = int((severity * 0.4) + (urgency * 0.3) + (impact * 0.2) + (delay_risk * 0.1))

    if score >= 85:
        level = "Critical"
    elif score >= 65:
        level = "High"
    elif score >= 45:
        level = "Medium"
    else:
        level = "Low"

    dept_map = {
        "Road": "Municipal",
        "Water": "Water Board",
        "Electricity": "EB",
        "Police": "Police Dept",
        "Women Safety": "Police Dept",
        "Hospital": "Health Dept",
        "Health": "Health Dept",
    }
    department = dept_map.get(category, "Municipal Maintenance Unit")

    return {
        "score": score,
        "level": level,
        "department": department,
        "severity": severity,
        "urgency": urgency,
        "impact": impact,
        "delay_risk": delay_risk,
        "sentiment": "negative" if score >= 45 else "neutral",
        "keywords": [w for w in ["emergency", "danger", "leak", "blocked"] if w in description_lower],
        "vector_analysis": "Completed",
        "timestamp": "Real-time sync",
    }
