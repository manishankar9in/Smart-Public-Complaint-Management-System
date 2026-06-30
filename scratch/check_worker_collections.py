import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import json

async def main():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client["public_complaint_system"]
    
    print("--- LOGIN CREDENTIALS COLLECTION ---")
    creds = await db["login_credentials"].find({}).to_list(length=100)
    for c in creds:
        c["_id"] = str(c["_id"])
        c.pop("password_hash", None)
        print(json.dumps(c, default=str))
        
    print("\n--- WORKERS COLLECTION ---")
    workers = await db["workers"].find({}).to_list(length=100)
    for w in workers:
        w["_id"] = str(w["_id"])
        print(json.dumps(w, default=str))

if __name__ == "__main__":
    asyncio.run(main())
