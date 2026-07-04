import asyncio
import sys

sys.path.insert(0, '.')

from dotenv import load_dotenv
load_dotenv()

from database.db import connect_to_mongo, db_manager


async def main():
    await connect_to_mongo()
    db = db_manager.db

    collections_to_clear = [
        'users',
        'workers',
        'admins',
        'login_credentials',
        'complaints',
        'worker_updates',
        'feedback',
        'notifications',
    ]

    for name in collections_to_clear:
        try:
            result = await db[name].delete_many({})
            print(f'{name}: deleted {result.deleted_count}')
        except Exception as exc:
            print(f'{name}: ERR {exc}')

    if db_manager.client:
        db_manager.client.close()


asyncio.run(main())
