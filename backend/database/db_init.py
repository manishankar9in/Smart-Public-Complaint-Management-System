from datetime import datetime

import bcrypt

from config import settings
from .db import db_manager


def _hash_password(raw: str) -> str:
    return bcrypt.hashpw(raw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


async def migrate_credentials_out_of_workers():
    """Move password fields from workers -> login_credentials collection."""
    db = db_manager.db
    try:
        workers_with_passwords = await db["workers"].find(
            {"password_hash": {"$exists": True}}
        ).to_list(length=500)

        migrated = 0
        for doc in workers_with_passwords:
            worker_uid = str(doc["_id"])
            email = (doc.get("email") or "").strip().lower()
            if not email:
                continue

            existing = await db["login_credentials"].find_one({
                "account_type": "worker",
                "account_id": worker_uid,
            })
            cred_doc = {
                "account_type": "worker",
                "account_id": worker_uid,
                "email": email,
                "password_hash": doc["password_hash"],
                "auth_provider": "local",
                "updated_at": datetime.utcnow(),
            }
            if doc.get("password_reset_token"):
                cred_doc["password_reset_token"] = doc["password_reset_token"]
                cred_doc["password_reset_expires"] = doc.get("password_reset_expires")

            if existing:
                await db["login_credentials"].update_one(
                    {"_id": existing["_id"]},
                    {"$set": cred_doc},
                )
            else:
                cred_doc["created_at"] = doc.get("created_at") or datetime.utcnow()
                await db["login_credentials"].insert_one(cred_doc)

            await db["workers"].update_one(
                {"_id": doc["_id"]},
                {
                    "$unset": {
                        "password_hash": "",
                        "password_reset_token": "",
                        "password_reset_expires": "",
                    }
                },
            )
            migrated += 1

        if migrated:
            print(f"Migrated credentials for {migrated} worker(s) to login_credentials collection.")
    except Exception as e:
        print(f"Credentials migration warning: {e}")


async def migrate_firebase_profiles_to_credentials():
    """Ensure public users and admins have credential records (Firebase auth reference)."""
    db = db_manager.db
    try:
        for doc in await db["users"].find({}).to_list(length=500):
            uid = doc.get("firebase_uid")
            email = doc.get("email")
            if not uid or not email:
                continue
            await db["login_credentials"].update_one(
                {"account_type": "public", "account_id": uid},
                {
                    "$set": {
                        "account_type": "public",
                        "account_id": uid,
                        "email": email.strip().lower(),
                        "firebase_uid": uid,
                        "auth_provider": "firebase",
                        "updated_at": datetime.utcnow(),
                    },
                    "$setOnInsert": {"created_at": datetime.utcnow()},
                },
                upsert=True,
            )

        for doc in await db["admins"].find({}).to_list(length=50):
            uid = doc.get("firebase_uid")
            email = doc.get("email")
            if not uid or not email:
                continue
            await db["login_credentials"].update_one(
                {"account_type": "admin", "account_id": uid},
                {
                    "$set": {
                        "account_type": "admin",
                        "account_id": uid,
                        "email": email.strip().lower(),
                        "firebase_uid": uid,
                        "auth_provider": "firebase",
                        "updated_at": datetime.utcnow(),
                    },
                    "$setOnInsert": {"created_at": datetime.utcnow()},
                },
                upsert=True,
            )
    except Exception as e:
        print(f"Firebase credentials sync warning: {e}")


async def sync_all_worker_solved_counts():
    """Initialize complaints_solved on each worker from resolved complaints."""
    db = db_manager.db
    try:
        workers = await db["workers"].find({}).to_list(length=500)
        for w in workers:
            worker_uid = str(w["_id"])
            count = await db["complaints"].count_documents({
                "worker_uid": worker_uid,
                "status": "RESOLVED",
            })
            await db["workers"].update_one(
                {"_id": w["_id"]},
                {"$set": {"complaints_solved": count}},
            )
        if workers:
            print(f"Synced complaints_solved for {len(workers)} worker(s).")
    except Exception as e:
        print(f"Worker stats sync warning: {e}")


async def migrate_accounts_to_separate_collections():
    """Move legacy role-based documents from users -> workers/admins collections."""
    db = db_manager.db
    try:
        legacy_workers = await db["users"].find({"role": "worker"}).to_list(length=500)
        migrated_workers = 0
        for doc in legacy_workers:
            wid = doc["_id"]
            if not await db["workers"].find_one({"_id": wid}):
                clean = {k: v for k, v in doc.items() if k not in ("role", "password_hash", "password_reset_token", "password_reset_expires")}
                if not clean.get("worker_uid"):
                    clean["worker_uid"] = str(wid)
                clean["complaints_solved"] = clean.get("complaints_solved", 0)
                await db["workers"].insert_one(clean)
            await db["users"].delete_one({"_id": wid})
            migrated_workers += 1
        if migrated_workers:
            print(f"Migrated {migrated_workers} worker account(s) to workers collection.")

        legacy_admins = await db["users"].find({"role": "admin"}).to_list(length=10)
        migrated_admins = 0
        for doc in legacy_admins:
            aid = doc["_id"]
            if not await db["admins"].find_one({"_id": aid}):
                clean = {k: v for k, v in doc.items() if k not in ("role", "password_hash")}
                await db["admins"].insert_one(clean)
            await db["users"].delete_one({"_id": aid})
            migrated_admins += 1
        if migrated_admins:
            print(f"Migrated {migrated_admins} admin account(s) to admins collection.")

        await db["users"].update_many({"role": {"$exists": True}}, {"$unset": {"role": ""}})
    except Exception as e:
        print(f"Account migration warning: {e}")


async def ensure_bootstrap_admin():
    """Create or update a bootstrap admin account from environment settings when configured."""
    email = (settings.ADMIN_EMAIL or "").strip().lower()
    password = (settings.ADMIN_PASSWORD or "").strip()
    if not email or not password:
        return

    db = db_manager.db
    existing = await db["admins"].find_one({"email": email})
    admin_data = {
        "email": email,
        "name": settings.ADMIN_NAME or "System Administrator",
        "updated_at": datetime.utcnow(),
    }
    if not existing:
        admin_data.update({
            "password_hash": _hash_password(password),
            "firebase_uid": f"admin_{email.replace('@', '_')}",
            "created_at": datetime.utcnow(),
        })
        await db["admins"].insert_one(admin_data)
        print(f"Created bootstrap admin account for {email}")
        return

    update_data = {"$set": admin_data}
    if not existing.get("password_hash"):
        update_data["$set"]["password_hash"] = _hash_password(password)
    if not existing.get("firebase_uid"):
        update_data["$set"]["firebase_uid"] = f"admin_{email.replace('@', '_')}"
    await db["admins"].update_one({"email": email}, update_data)
    print(f"Updated bootstrap admin account for {email}")


async def init_collections():
    required_collections = [
        "users",
        "workers",
        "admins",
        "login_credentials",
        "complaints",
        "worker_updates",
        "feedback",
        "notifications",
    ]

    try:
        existing = await db_manager.db.list_collection_names()

        for name in required_collections:
            if name not in existing:
                await db_manager.db.create_collection(name)
                print(f"Created collection: {name}")
            else:
                print(f"Collection {name} already exists.")

        await migrate_accounts_to_separate_collections()
        await migrate_credentials_out_of_workers()
        await migrate_firebase_profiles_to_credentials()
        await sync_all_worker_solved_counts()
        await ensure_bootstrap_admin()
        print("Initialization complete.")
    except Exception as e:
        print(f"Error during collection initialization: {e}")
