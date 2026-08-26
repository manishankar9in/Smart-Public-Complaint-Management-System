# Smart Public Complaint Management System 🚨

An AI-powered web application that helps citizens report public problems such as potholes, water issues, electricity problems, and road damage. The system automatically identifies the department and priority, assigns the complaint to a nearby worker, and allows admins to monitor and verify the complaint resolution.

## 🎯 Problem

Traditional complaint systems often have:

* Slow complaint processing
* Wrong department assignment
* Difficulty finding the right worker
* No proper complaint tracking
* Fake or incorrect locations
* Poor communication between citizens and departments

## 💡 Solution

Our system provides a single platform where:

**Citizen → Reports Complaint → AI Analyzes → Worker Assigned → Admin Verifies → Citizen Notified**

## ✨ Main Features

### 👤 User

* Register and Login
* Google Login
* Email Verification
* Submit complaints
* GPS-based location detection
* Upload complaint images
* Track complaint status
* View complaints on Google Maps
* Receive email notifications

### 👷 Worker

* Worker Login/Register
* Google Login
* Email Verification
* Select department, state, and district
* View assigned complaints
* View complaint location on map
* Update complaint status
* Upload proof after solving the complaint
* Receive email notifications

### 👨‍💼 Admin

* Admin Login
* View all complaints
* View workers
* Monitor complaints on Google Maps
* Assign/manage complaints
* Verify worker proof
* Update complaint status

## 🤖 AI Features

The AI analyzes every complaint and identifies:

* Department
* Priority
* Reason

Example:

```text
Complaint:
"Electricity problem since 5 days"

AI Result:
Department: Electricity Department
Priority: Medium
```

## 📍 GPS Location

Complaints use the user's **GPS-detected latitude and longitude**.

This helps the system:

* Identify the complaint location
* Find nearby workers
* Display complaints on the map
* Improve worker assignment

## 👷 Worker Assignment

Workers are assigned based on:

* Department
* District
* Availability
* Location

Only **one active worker is allowed for each department in each district**.

Example:

```text
Chennai + Water → Worker 1
Chennai + Roads → Worker 2
Madurai + Water → Worker 3
```

## 🗺️ Google Maps

The map is available for:

* User
* Worker
* Admin

Users mainly see their own complaints.

Workers can view assigned complaint locations.

Admins can monitor complaints and worker locations.

## 🔐 Authentication

Firebase Authentication is used for secure login.

Supported:

* Email & Password
* Google Login
* Email Verification
* Password Reset

User and Worker accounts are separate.

A User cannot access the Worker Dashboard, and a Worker cannot access the User Dashboard.

## 📧 Notifications

The system can send email notifications for:

* Account verification
* Complaint submission
* Worker assignment
* Complaint status updates
* Complaint resolution
* Admin verification

n8n is used for workflow automation and notifications.

## ⚙️ Technology Used

### Frontend

* React.js
* Vite
* Tailwind CSS
* Axios

### Backend

* Python
* FastAPI

### Database

* MongoDB Atlas

### Authentication

* Firebase Authentication

### AI

* Large Language Model
* Complaint Classification
* Priority Detection

### Automation

* n8n

### Maps

* Google Maps API

## 🔄 Project Workflow

```text
User
 ↓
Submit Complaint
 ↓
GPS Location
 ↓
FastAPI Backend
 ↓
AI Analysis
 ↓
Department + Priority
 ↓
MongoDB Atlas
 ↓
Worker Assignment
 ↓
n8n Automation
 ↓
Email Notification
 ↓
Worker Resolves Complaint
 ↓
Admin Verifies
 ↓
User Gets Update
```

## 🚀 How to Run

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

### Required Services

Before running the project, configure:

* MongoDB Atlas
* Firebase
* Google Maps API
* n8n
* Required AI API

Add the required API keys and database URLs to your `.env` files.

## 📌 Future Improvements

* WhatsApp complaint reporting
* SMS complaint reporting
* Voice-based complaints
* Multilingual support
* Complaint hotspot prediction
* Advanced analytics

## 👨‍💻 Developer

**Yellumgudla Mani Shankar**

B.Tech CSE (AI/ML)
Kalasalingam University

---

⭐ If you find this project useful, consider giving it a star!
