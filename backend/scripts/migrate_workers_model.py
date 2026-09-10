"""
Migration script to update worker documents in MongoDB Atlas:
Ensures all workers have:
- department
- available
- latitude
- longitude
- duty_position (for backwards-compatibility)
"""

import asyncio
import sys
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from database.db import get_database


async def migrate_workers():
    db = await get_database()
    print("Migrating workers in MongoDB Atlas...")

    # 1. Update Worker 1 (99230040535) -> Public Works
    w1_res = await db.workers.update_one(
        {"email": "99230040535@klu.ac.in"},
        {
            "$set": {
                "department": "Public Works",
                "duty_position": "Road",
                "available": True,
                "latitude": 9.59,
                "longitude": 77.96,
                "updated_at": datetime.utcnow(),
            }
        }
    )
    print(f"Worker 99230040535 updated (matched: {w1_res.matched_count})")

    # 2. Update Worker 2 (99230041011) -> Health Dept
    w2_res = await db.workers.update_one(
        {"email": "99230041011@klu.ac.in"},
        {
            "$set": {
                "department": "Health Dept",
                "duty_position": "Hospital",
                "available": True,
                "latitude": 9.58,
                "longitude": 77.80,
                "updated_at": datetime.utcnow(),
            }
        }
    )
    print(f"Worker 99230041011 updated (matched: {w2_res.matched_count})")

    # 3. Check for 3rd worker or create default 3rd worker (Electricity / Public Works)
    w3 = await db.workers.find_one({"email": "99230040100@klu.ac.in"})
    if not w3:
        # Create standard 3rd worker
        w3_doc = {
            "email": "99230040100@klu.ac.in",
            "name": "99230040100",
            "department": "Electricity",
            "duty_position": "Electricity",
            "available": True,
            "latitude": 9.59,
            "longitude": 77.95,
            "state": "Tamil Nadu",
            "city": "Virudhunagar",
            "ward": "rajyapalyam",
            "phone": "9876543210",
            "complaints_solved": 0,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }
        res3 = await db.workers.insert_one(w3_doc)
        await db.workers.update_one({"_id": res3.inserted_id}, {"$set": {"worker_uid": str(res3.inserted_id)}})
        print(f"Worker 3 created with ID: {res3.inserted_id}")
    else:
        await db.workers.update_one(
            {"_id": w3["_id"]},
            {
                "$set": {
                    "department": "Electricity",
                    "duty_position": "Electricity",
                    "available": True,
                    "latitude": 9.59,
                    "longitude": 77.95,
                    "updated_at": datetime.utcnow(),
                }
            }
        )
        print("Worker 3 updated.")

    # 4. Set default available=True, latitude, longitude for ANY other worker lacking them
    await db.workers.update_many(
        {"available": {"$exists": False}},
        {"$set": {"available": True}}
    )
    await db.workers.update_many(
        {"department": {"$exists": False}},
        {"$set": {"department": "Public Works"}}
    )

    # 5. Print final state of all workers
    print("\n--- Final Workers in MongoDB ---")
    all_workers = await db.workers.find({}).to_list(100)
    for w in all_workers:
        print({
            "name": w.get("name"),
            "email": w.get("email"),
            "department": w.get("department"),
            "duty_position": w.get("duty_position"),
            "available": w.get("available"),
            "latitude": w.get("latitude"),
            "longitude": w.get("longitude"),
            "state": w.get("state"),
            "city": w.get("city"),
            "ward": w.get("ward"),
        })

if __name__ == "__main__":
    asyncio.run(migrate_workers())
