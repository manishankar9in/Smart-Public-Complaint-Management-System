import logging
from motor.motor_asyncio import AsyncIOMotorClient
from fastapi import HTTPException
from config import settings

logger = logging.getLogger(__name__)

class Database:
    client: AsyncIOMotorClient = None

    @property
    def db_name(self) -> str:
        return settings.get_database_name()

    @property
    def db(self):
        if not self.client:
            raise HTTPException(
                status_code=503,
                detail="Database connection is offline. Please configure MONGODB_URL correctly."
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
    def email_logs(self):
        return self.db["email_logs"]

    @property
    def login_credentials(self):
        return self.db["login_credentials"]

    @property
    def email_verify_tokens(self):
        return self.db["email_verify_tokens"]

    def __getattr__(self, name: str):
        """Allow accessing any MongoDB collection dynamically via db.<collection_name>"""
        return self.db[name]

db_manager = Database()

import asyncio
_connect_lock = asyncio.Lock()

async def get_database():
    if db_manager.client is None:
        async with _connect_lock:
            if db_manager.client is None:
                await connect_to_mongo()
    return db_manager

async def connect_to_mongo():
    uri = settings.MONGODB_URL
    if not uri:
        error_msg = "CRITICAL CONFIGURATION ERROR: MONGODB_URL environment variable is missing or empty! Database connection cannot be initialized."
        logger.critical(error_msg)
        raise ValueError(error_msg)

    if "localhost" in uri or "127.0.0.1" in uri:
        error_msg = f"CRITICAL CONFIGURATION ERROR: Local database references are not allowed! MONGODB_URL is set to '{uri}', but MongoDB Atlas must be used."
        logger.critical(error_msg)
        raise ValueError(error_msg)

    logger.info("Initializing connection to MongoDB Atlas...")
    import certifi
    kwargs = {
        "serverSelectionTimeoutMS": 15000,
        "connectTimeoutMS": 10000,
        "socketTimeoutMS": 15000,
        "tlsCAFile": certifi.where(),
    }
    if uri.startswith("mongodb+srv://"):
        kwargs["tls"] = True

    try:
        db_manager.client = AsyncIOMotorClient(uri, **kwargs)
        await db_manager.client.admin.command("ping")
        logger.info(f"Successfully connected to MongoDB database: {db_manager.db_name}")
        return True
    except Exception as exc:
        db_manager.client = None
        logger.critical(f"MongoDB connection failed: {exc}")
        raise RuntimeError(f"Database connection failed: {exc}") from exc

async def close_mongo_connection():
    if db_manager.client:
        db_manager.client.close()
        db_manager.client = None
        logger.info("Closed MongoDB connection.")
