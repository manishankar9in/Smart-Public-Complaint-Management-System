from motor.motor_asyncio import AsyncIOMotorClient
from fastapi import HTTPException
from config import settings

class Database:
    client: AsyncIOMotorClient = None
    db_name: str = settings.DATABASE_NAME

    @property
    def db(self):
        if not self.client:
            raise HTTPException(
                status_code=503,
                detail="Database connection is offline. Please configure MONGODB_URI correctly."
            )
        return self.client[self.db_name]

    @property
    def users(self):
        return self.db["users"]

    @property
    def workers(self):
        return self.db["workers"]

    @property
    def admins(self):
        return self.db["admins"]

    @property
    def complaints(self):
        return self.db["complaints"]

    @property
    def worker_updates(self):
        return self.db["worker_updates"]

    @property
    def feedback(self):
        return self.db["feedback"]

    @property
    def notifications(self):
        return self.db["notifications"]

    @property
    def login_credentials(self):
        return self.db["login_credentials"]

db_manager = Database()

async def get_database():
    return db_manager

async def connect_to_mongo():
    # Avoid failing the whole app when MongoDB is unavailable in deployment.
    uri = settings.MONGODB_URI or "mongodb://localhost:27017"
    kwargs = {
        "serverSelectionTimeoutMS": 8000,
        "connectTimeoutMS": 8000,
        "socketTimeoutMS": 15000,
    }
    # Atlas (mongodb+srv) uses TLS automatically; local mongodb:// does not need it.
    if uri.startswith("mongodb+srv://"):
        kwargs["tls"] = True

    try:
        db_manager.client = AsyncIOMotorClient(uri, **kwargs)
        await db_manager.client.admin.command("ping")
        print(f"Connected to MongoDB database: {db_manager.db_name}")
        return True
    except Exception as exc:
        db_manager.client = None
        print(f"MongoDB unavailable: {exc}")
        return False

async def close_mongo_connection():
    if db_manager.client:
        db_manager.client.close()
        db_manager.client = None
        print("Closed MongoDB connection.")
