import asyncio
import os
import sys

# Ensure backend root is on sys.path when executed from different working dirs
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from config import settings
from database.db import connect_to_mongo, db_manager

async def main():
    await connect_to_mongo()
    db = db_manager.client[settings.get_database_name()]
    workers = await db.workers.find().limit(10).to_list(length=10)
    creds = await db.login_credentials.find({'account_type':'worker'}).limit(10).to_list(length=10)
    print("Workers:")
    for w in workers:
        print('-', w.get('email'))
    print('\nCredentials:')
    for c in creds:
        print('-', c.get('email'))
    await db_manager.client.close()

if __name__ == '__main__':
    asyncio.run(main())
