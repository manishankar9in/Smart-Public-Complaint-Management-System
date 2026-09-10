# Deployment Guide

This project is a multi-role system with:
- Public users (Firebase email/password + Google)
- Field workers (local backend auth)
- Admins (Firebase-backed admin login)
- Shared backend API for complaints, worker routing, and verification

## Recommended architecture

### Option 1: Single frontend site (recommended)

Use one Vercel deployment for the frontend and one backend deployment for the FastAPI API.

Why this is best:
- Simplest configuration
- Both users and admins share the same frontend codebase
- Routes are already built into the app (`/login`, `/admin-login`, `/worker-dashboard`, etc.)
- Shared backend keeps user/worker/admin data in one place

How it works:
- Frontend deployed to `https://your-app.vercel.app`
- Backend deployed to a separate host, e.g. Render, Railway, Cloud Run, or VPS
- Both apps use the same API base URL
- Admin login page remains available at `/admin-login`

### Option 2: Separate frontend sites for admin and user/worker

This is possible and can be done safely, but it is not required.

Requirements:
- Both frontend sites point to the same backend API
- Both sites use the same MongoDB and backend state
- Firebase authorized domains must include both frontend domains
- Backend CORS must allow both domains
- If worker reset email is used, `FRONTEND_URL` in backend env should point to the worker/user site URL

Potential deployment layout:
- `https://app.yourdomain.com` → user + worker site
- `https://admin.yourdomain.com` → admin site
- `https://api.yourdomain.com` → backend API

This works because frontend and backend are separate layers:
- the UI is static and can be hosted independently
- the API is centralized and shared
- data flows through the backend, so admin verification works across both sites

## Backend deployment

### Recommended hosts
- Render
- Railway
- Google Cloud Run
- AWS Elastic Beanstalk
- DigitalOcean App Platform
- Any host that can run Python and connect to MongoDB Atlas

### Backend start command

For production, use a WSGI server such as Gunicorn:

```bash
gunicorn -k uvicorn.workers.UvicornWorker backend.main:app --bind 0.0.0.0:$PORT --workers 1
```

Or use Uvicorn directly if your host supports it:

```bash
uvicorn backend.main:app --host 0.0.0.0 --port $PORT
```

### Required backend environment variables

Set these in your host environment:

- `MONGODB_URL`
- `DATABASE_NAME`
- `JWT_SECRET`
- `JWT_ALGORITHM` (default: `HS256`)
- `JWT_EXPIRE_MINUTES`
- `FRONTEND_URL` (production frontend URL used for worker reset links)
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `SMTP_FROM_EMAIL`

If SMTP is not configured, worker reset still works in dev mode because the backend returns the reset link directly. In production, configure SMTP so emails are delivered.

### Optional backend env

- `FIREBASE_PROJECT_ID` (if using backend Firebase token verification later)

### CORS

The backend already allows Vercel domains via regex. If you use custom domains, add them to `backend/main.py` under `origins` or `allow_origin_regex`.

Example custom domain:

```python
origins = [
    "https://app.yourdomain.com",
    "https://admin.yourdomain.com",
]
```

## Frontend deployment (Vercel)

### Single-site deployment
1. Connect the repo to Vercel.
2. Set build command: `npm run build`
3. Set output directory: `dist`
4. Configure environment variables:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
   - `VITE_BACKEND_URL` = your backend API base URL, e.g. `https://api.yourdomain.com`
   - `VITE_EMAILJS_SERVICE_ID` (optional)
   - `VITE_EMAILJS_TEMPLATE_ID` (optional)
   - `VITE_EMAILJS_PUBLIC_KEY` (optional)

### Separate admin and user/worker sites

You can create two Vercel projects from the same repository:

- `app-site` with `VITE_BACKEND_URL=https://api.yourdomain.com`
- `admin-site` with `VITE_BACKEND_URL=https://api.yourdomain.com`

Both sites can use the same codebase, but they will each render the app. The admin-site will still contain the admin routes and can use `/admin-login`.

If you want a strictly admin-only frontend, you can later customize the repo to hide public/worker navigation on that deployment.

## Firebase configuration

### Firebase Console settings
- Add each deployed domain to Authentication → Authorized domains
- Enable Email/Password sign-in
- Enable Google sign-in if public users will use Google login

### For separate frontend domains
Authorized domains must include:
- `https://app.yourdomain.com`
- `https://admin.yourdomain.com`
- any Vercel preview domains if you want staging/testing

## Admin setup

### Create admin account
Use `/api/auth/create-admin` or seed the `admins` collection with a hashed password.

The `ADMIN_SETUP.md` in repo already includes creation and update options.

### Production notes
- Admin dashboard is protected by role checks in the frontend
- The backend verifies admin credentials via `/api/auth/admin-login`
- The admin site and user site can share the same backend and data

## Worker reset link behavior

For worker password reset, the backend uses `FRONTEND_URL` to generate the reset page link:

```python
reset_link = f"{settings.FRONTEND_URL.rstrip('/')}/worker-reset-password?token={token}"
```

So for production:
- set `FRONTEND_URL` to the worker/user frontend URL, not the admin URL
- if you have a separate admin site, keep worker reset links pointing to the main site

## What I recommend for your case

### Best choice: one frontend + one backend
- Deploy the current frontend to one Vercel site
- Deploy backend to Render/Railway/Cloud Run
- Use `/admin-login` for admin access
- This avoids any extra configuration and keeps everything consistent

### If you want separate sites anyway
- Deploy both frontends to Vercel
- Point both to the same backend API URL
- Add both domains to Firebase authorized domains
- Use `FRONTEND_URL` for the user/worker frontend URL only
- Keep the same shared backend and MongoDB

## Final sanity check before deploy

- Backend is running on one hosted URL
- Frontend(s) use the same `VITE_BACKEND_URL`
- Firebase has both domains authorized
- `FRONTEND_URL` points to the worker/user frontend URL
- MongoDB is accessible from the backend host
- Admin account exists and can log in

## Quick start summary

1. Deploy backend to a hosting service.
2. Deploy frontend to Vercel.
3. Set env vars in both hosts.
4. Add Firebase authorized domains.
5. Create admin account.
6. Test public, worker, and admin login flows.

---

If you want, I can also create a second file `DEPLOYMENT-SEPARATE-FRONTEND.md` showing exactly how to deploy one Vercel site for `app` and one for `admin` with the same backend. Let me know if you want that next.