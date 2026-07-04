import os
import sys
import asyncio

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from config import settings
from database.db import connect_to_mongo, db_manager

async def main(email):
    await connect_to_mongo()
    db = db_manager.client[settings.get_database_name()]
    cred = await db.login_credentials.find_one({'account_type':'worker','email': email.strip().lower()})
    if not cred:
        print('No credentials found for', email)
    else:
        print('email:', cred.get('email'))
        print('password_reset_token:', cred.get('password_reset_token'))
        print('password_reset_expires:', cred.get('password_reset_expires'))
    await db_manager.client.close()

if __name__ == '__main__':
    import sys
    if len(sys.argv) < 2:
        print('Usage: python get_reset_token.py email')
        sys.exit(1)
    asyncio.run(main(sys.argv[1]))
