import argparse
import asyncio
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from config import settings
from database.db import connect_to_mongo, db_manager


async def inspect_workers(email: str | None):
    await connect_to_mongo()
    db = db_manager.client[settings.DATABASE_NAME]

    if email:
        email_norm = email.strip().lower()
        worker = await db.workers.find_one({"email": email_norm})
        cred = await db.login_credentials.find_one({"account_type": "worker", "email": email_norm})
        if worker:
            print("Worker profile:")
            print("  email:", worker.get("email"))
            print("  worker_uid:", worker.get("worker_uid"))
            print("  name:", worker.get("name"))
            print("  duty_position:", worker.get("duty_position"))
            print("  state:", worker.get("state"))
            print("  city:", worker.get("city"))
            print("  created_at:", worker.get("created_at"))
            print()
        else:
            print(f"No worker profile found for email: {email_norm}")

        if cred:
            print("Worker credentials:")
            print("  email:", cred.get("email"))
            print("  account_id:", cred.get("account_id"))
            print("  password_hash:", "present" if cred.get("password_hash") else "missing")
            print("  reset_token:", cred.get("password_reset_token"))
            print("  reset_expires:", cred.get("password_reset_expires"))
        else:
            print(f"No worker credentials found for email: {email_norm}")
    else:
        workers = await db.workers.find().limit(20).to_list(length=20)
        creds = await db.login_credentials.find({"account_type": "worker"}).limit(20).to_list(length=20)

        print("Workers (first 20):")
        for w in workers:
            print(f"  - {w.get('email')} | worker_uid={w.get('worker_uid')} | duty={w.get('duty_position')}")
        print()

        print("Worker credentials (first 20):")
        for c in creds:
            print(f"  - {c.get('email')} | account_id={c.get('account_id')} | reset_token={'yes' if c.get('password_reset_token') else 'no'}")

    await db_manager.client.close()


def main():
    parser = argparse.ArgumentParser(description="Inspect worker profiles and credentials in MongoDB.")
    parser.add_argument("--email", help="Email of the worker to inspect")
    args = parser.parse_args()
    asyncio.run(inspect_workers(args.email))


if __name__ == "__main__":
    main()
