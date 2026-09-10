"""Quick MongoDB data verification script."""
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from motor.motor_asyncio import AsyncIOMotorClient
from config import settings


async def main():
    client = AsyncIOMotorClient(settings.MONGODB_URI, serverSelectionTimeoutMS=5000)
    db = client[settings.DATABASE_NAME]

    try:
        await client.admin.command("ping")
        print(f"MongoDB connected: {settings.MONGODB_URI}")
        print(f"Database: {settings.DATABASE_NAME}")
    except Exception as exc:
        print(f"MongoDB connection FAILED: {exc}")
        return

    collections = await db.list_collection_names()
    print("\n--- COLLECTIONS ---")
    print(collections)

    public_count = await db["users"].count_documents({})
    worker_count = await db["workers"].count_documents({})
    admin_count = await db["admins"].count_documents({})
    cred_count = await db["login_credentials"].count_documents({})
    complaint_count = await db["complaints"].count_documents({})
    feedback_count = await db["feedback"].count_documents({})

    print("\n--- COUNTS (separate collections) ---")
    print(f"Public users (users): {public_count}")
    print(f"Workers (workers): {worker_count}")
    print(f"Admins (admins): {admin_count}")
    print(f"Login credentials (login_credentials): {cred_count}")
    print(f"Complaints: {complaint_count}")
    print(f"Feedback: {feedback_count}")

    workers_with_password = await db["workers"].count_documents({"password_hash": {"$exists": True}})
    print(f"\nWorkers with password in profile (should be 0): {workers_with_password}")

    print("\n--- LOGIN CREDENTIALS BY TYPE ---")
    for acct_type in ("public", "worker", "admin"):
        n = await db["login_credentials"].count_documents({"account_type": acct_type})
        print(f"  {acct_type}: {n}")

    print("\n--- SAMPLE WORKERS (profile only, no passwords) ---")
    workers = await db["workers"].find({}).to_list(length=5)
    for w in workers:
        w["_id"] = str(w["_id"])
        w.pop("password_hash", None)
        w.pop("password_reset_token", None)
        print(json.dumps(w, default=str))

    print("\n--- SAMPLE PUBLIC USERS ---")
    users = await db["users"].find({}).to_list(length=3)
    for u in users:
        u["_id"] = str(u["_id"])
        print(json.dumps({k: u[k] for k in u if k != "password_hash"}, default=str))

    print("\n--- SAMPLE ADMINS ---")
    admins = await db["admins"].find({}).to_list(length=3)
    for a in admins:
        a["_id"] = str(a["_id"])
        print(json.dumps({k: a[k] for k in a if k != "password_hash"}, default=str))

    print("\n--- SAMPLE COMPLAINTS ---")
    complaints = await db["complaints"].find({}).sort("created_at", -1).to_list(length=3)
    for c in complaints:
        print(json.dumps({
            "_id": str(c["_id"]),
            "category": c.get("category"),
            "status": c.get("status"),
            "state": c.get("state"),
            "city": c.get("city"),
            "worker_uid": c.get("worker_uid"),
        }, default=str))

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
