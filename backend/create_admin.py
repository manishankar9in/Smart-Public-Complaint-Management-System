"""
Admin Account Creation Script

Run this script to create an admin account for the Smart Complaint System.

Usage:
    python create_admin.py

The script will prompt for:
- Admin email
- Admin password
- Admin name
- Firebase UID (can use any unique string)
"""

import asyncio
import sys
from passlib.context import CryptContext
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
from getpass import getpass
from config import settings

# MongoDB connection string and database name from backend config
MONGODB_URI = settings.MONGODB_URI
DATABASE_NAME = settings.DATABASE_NAME

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


async def create_admin_account():
    """Create an admin account with proper password hashing."""
    
    print("=" * 60)
    print("Admin Account Creation")
    print("=" * 60)
    
    # Get admin details
    email = input("Enter admin email: ").strip()
    if not email:
        print("Error: Email is required")
        return
    
    password = getpass("Enter admin password: ").strip()
    if not password:
        print("Error: Password is required")
        return
    
    confirm_password = getpass("Confirm admin password: ").strip()
    if password != confirm_password:
        print("Error: Passwords do not match")
        return
    
    name = input("Enter admin name: ").strip() or "Admin"
    firebase_uid = input("Enter Firebase UID (or press Enter for auto-generated): ").strip()
    
    if not firebase_uid:
        firebase_uid = f"admin_{email.replace('@', '_')}"
    
    # Connect to MongoDB
    print("\nConnecting to MongoDB...")
    try:
        client = AsyncIOMotorClient(MONGODB_URI)
        db = client[DATABASE_NAME]
        
        # Test connection
        await db.command("ping")
        print("Connected to MongoDB successfully")
        
    except Exception as e:
        print(f"Error connecting to MongoDB: {e}")
        print(f"Make sure MongoDB is running at: {MONGODB_URI}")
        return
    
    # Check if admin already exists
    print("\nChecking if admin already exists...")
    existing = await db.admins.find_one({"email": email.lower()})
    if existing:
        print(f"Error: Admin with email '{email}' already exists")
        response = input("Do you want to update the password? (y/n): ").strip().lower()
        if response != 'y':
            return
        
        # Update existing admin
        password_hash = pwd_context.hash(password)
        await db.admins.update_one(
            {"email": email.lower()},
            {"$set": {"password_hash": password_hash, "updated_at": datetime.utcnow()}}
        )
        print(f"Admin password updated successfully for: {email}")
    else:
        # Create new admin
        print("Creating new admin account...")
        password_hash = pwd_context.hash(password)
        
        admin_data = {
            "email": email.lower(),
            "password_hash": password_hash,
            "name": name,
            "firebase_uid": firebase_uid,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }
        
        result = await db.admins.insert_one(admin_data)
        print(f"Admin account created successfully!")
        print(f"Admin ID: {result.inserted_id}")
    
    # Display summary
    print("\n" + "=" * 60)
    print("Admin Account Summary")
    print("=" * 60)
    print(f"Email: {email}")
    print(f"Name: {name}")
    print(f"Firebase UID: {firebase_uid}")
    print(f"\nLogin URL: http://localhost:5173/admin-login")
    print(f"Production URL: https://your-domain.vercel.app/admin-login")
    print("=" * 60)
    
    # Close connection
    client.close()


async def main():
    try:
        await create_admin_account()
    except KeyboardInterrupt:
        print("\n\nOperation cancelled by user")
    except Exception as e:
        print(f"\nError: {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
