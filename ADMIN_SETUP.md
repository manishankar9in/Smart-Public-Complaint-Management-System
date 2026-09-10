# Admin Account Setup Guide

## Important: Admin Login Issue Fixed

The admin login was failing because admin accounts in the database don't have password hashes. You need to create admin accounts with proper password hashing.

## Option 1: Create Admin via API (Recommended)

Use this Python script to create the first admin account:

```python
import requests
import json

# Backend URL (adjust for your environment)
BACKEND_URL = "http://127.0.0.1:8000"

# Admin details
admin_data = {
    "email": "admin@municipality.gov",
    "password": "your_secure_password",
    "name": "Admin User",
    "firebase_uid": "admin_firebase_uid_placeholder"  # Can be any unique string
}

# Create admin
response = requests.post(
    f"{BACKEND_URL}/api/auth/create-admin",
    json=admin_data
)

if response.status_code == 200:
    print("Admin account created successfully!")
    print(json.dumps(response.json(), indent=2))
else:
    print(f"Failed to create admin: {response.status_code}")
    print(response.text)
```

## Option 2: Create Admin via MongoDB Direct

If you have direct access to MongoDB:

```python
from passlib.context import CryptContext
from motor.motor_asyncio import AsyncIOMotorClient
import asyncio

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

async def create_admin():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client.smart_complaint_db
    
    password_hash = pwd_context.hash("your_secure_password")
    
    admin_data = {
        "email": "admin@municipality.gov",
        "password_hash": password_hash,
        "name": "Admin User",
        "firebase_uid": "admin_firebase_uid_placeholder",
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    
    result = await db.admins.insert_one(admin_data)
    print(f"Admin created with ID: {result.inserted_id}")

asyncio.run(create_admin())
```

## Option 3: Update Existing Admin Accounts

If you already have admin accounts without password hashes, update them:

```python
from passlib.context import CryptContext
from motor.motor_asyncio import AsyncIOMotorClient
import asyncio

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

async def update_admin_password():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client.smart_complaint_db
    
    # Update all admins without password_hash
    admins = await db.admins.find({"password_hash": {"$exists": False}}).to_list(length=100)
    
    for admin in admins:
        password_hash = pwd_context.hash("new_secure_password")
        await db.admins.update_one(
            {"_id": admin["_id"]},
            {"$set": {"password_hash": password_hash}}
        )
        print(f"Updated admin: {admin['email']}")

asyncio.run(update_admin_password())
```

## After Creating Admin Account

1. **Access Admin Login**: Go to `http://localhost:5173/admin-login` (local) or `https://your-domain.vercel.app/admin-login` (production)

2. **Login with Credentials**:
   - Email: The email you used to create the admin
   - Password: The password you set

3. **Access Admin Dashboard**: After successful login, you'll be redirected to `/admin-dashboard`

## Security Notes

- **Change Default Password**: After first login, change the password immediately
- **Use Strong Passwords**: Use complex passwords with uppercase, lowercase, numbers, and special characters
- **Limit Admin Access**: Only create admin accounts for authorized personnel
- **Monitor Login Attempts**: Check backend logs for suspicious login attempts
- **Secure the Setup Endpoint**: In production, consider removing or protecting the `/create-admin` endpoint

## Troubleshooting

### Admin Login Fails with 500 Error
- **Cause**: Admin account doesn't have password_hash field
- **Solution**: Use one of the options above to create/update admin with proper password hash

### Admin Login Fails with 401 Error
- **Cause**: Invalid email or password
- **Solution**: Verify credentials and ensure password hash is correct

### Cannot Access Admin Login Page
- **Cause**: URL is not linked on public site (intentional for security)
- **Solution**: Access directly via `/admin-login` URL

## Production Deployment

Before deploying to production:

1. **Create Admin Account**: Use Option 1 or 2 to create admin account
2. **Test Login**: Verify admin login works on staging
3. **Secure Endpoint**: Consider removing `/create-admin` endpoint after initial setup
4. **Add Rate Limiting**: Already implemented in backend
5. **Enable HTTPS**: Required for production
6. **Set Environment Variables**: Add `VITE_GOOGLE_MAPS_API_KEY` to Vercel

## Admin Portal URL

- **Local**: `http://localhost:5173/admin-login`
- **Production**: `https://your-domain.vercel.app/admin-login`

This URL is intentionally not linked on the public website for security.
