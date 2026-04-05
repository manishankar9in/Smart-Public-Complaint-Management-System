from motor.motor_asyncio import AsyncIOMotorClient
from config import settings

class Database:
    client: AsyncIOMotorClient = None
    db_name: str = settings.DATABASE_NAME

    @property
    def db(self):
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

db_manager = Database()

async def get_database():
    return db_manager

async def connect_to_mongo():
    # Fail fast when MongoDB is not running (avoids very long hangs on first DB call)
    db_manager.client = AsyncIOMotorClient(
        settings.MONGODB_URI,
        serverSelectionTimeoutMS=8000,
        connectTimeoutMS=8000,
        socketTimeoutMS=15000,
    )
    print(f"Connected to MongoDB: {db_manager.db_name}")

async def close_mongo_connection():
    if db_manager.client:
        db_manager.client.close()
        print("Closed MongoDB connection.")
