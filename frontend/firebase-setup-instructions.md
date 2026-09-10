# Firebase Setup Instructions

## 1. Create Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project" 
3. Enter project name: "smart-complaint-system"
4. Enable Google Analytics (optional)
5. Click "Create project"

## 2. Enable Authentication
1. In Firebase Console, go to "Authentication" 
2. Click "Sign-in method"
3. Enable "Email/Password" provider
4. Optionally enable "Google" provider

## 3. Get Firebase Configuration
1. Go to Project Settings (gear icon)
2. Scroll down to "Firebase SDK snippet"
3. Copy the configuration values

## 4. Update .env.local file
Create `.env.local` in frontend folder with:
```
VITE_FIREBASE_API_KEY=your_actual_api_key_here
VITE_FIREBASE_AUTH_DOMAIN=your-project-name.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project-name.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_BACKEND_URL=http://localhost:8000
```

## 5. Test Configuration
After setting up .env.local, restart the frontend dev server to load the new environment variables.
