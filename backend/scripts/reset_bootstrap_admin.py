import os
import asyncio
import sys

os.chdir(r'd:\YELLUMGUDLA MANI SHANKAR\Smart Public Complaint Priority and Response System\backend')
sys.path.insert(0, '.')

import dotenv

dotenv.load_dotenv()

from database.db import connect_to_mongo, db_manager
from database.db_init import ensure_bootstrap_admin


async def main() -> None:
    await connect_to_mongo()
    await ensure_bootstrap_admin()
    if db_manager.client:
        db_manager.client.close()
    print('Bootstrap admin password updated successfully')


if __name__ == '__main__':
    asyncio.run(main())
