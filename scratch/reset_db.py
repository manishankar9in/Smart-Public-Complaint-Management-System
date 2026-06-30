"""Reset MongoDB data for fresh testing. Keeps admin account only."""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

DB_NAME = "public_complaint_system"
MONGO_URI = "mongodb://localhost:27017"


async def main():
    client = AsyncIOMotorClient(MONGO_URI)
    db = client[DB_NAME]

    complaints = await db.complaints.delete_many({})
    notifications = await db.notifications.delete_many({})
    feedback = await db.feedback.delete_many({}) if "feedback" in await db.list_collection_names() else type("R", (), {"deleted_count": 0})()
    worker_updates = await db.worker_updates.delete_many({}) if "worker_updates" in await db.list_collection_names() else type("R", (), {"deleted_count": 0})()

    users_public = await db.users.delete_many({})
    workers_removed = await db.workers.delete_many({})

    admins_left = await db.admins.count_documents({})

    print("=== Database reset complete ===")
    print(f"Complaints removed: {complaints.deleted_count}")
    print(f"Notifications removed: {notifications.deleted_count}")
    print(f"Public users removed: {users_public.deleted_count}")
    print(f"Workers removed: {workers_removed.deleted_count}")
    print(f"Admin accounts kept: {admins_left}")
    print("\nNote: Firebase accounts still exist — delete test users in Firebase Console if needed.")
    print("Register fresh public/worker accounts via the website.")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
