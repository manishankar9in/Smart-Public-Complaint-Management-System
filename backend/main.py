import asyncio
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database.db import close_mongo_connection, connect_to_mongo, db_manager
from database.db_init import init_collections

@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_to_mongo()
    try:
        await asyncio.wait_for(init_collections(), timeout=25.0)
    except asyncio.TimeoutError:
        print("WARNING: Collection init timed out — check MongoDB.")
    except Exception as e:
        print(f"WARNING: Collection init failed: {e}")
    yield
    await close_mongo_connection()

app = FastAPI(
    title="Smart Public Complaint Priority and Response System API",
    description="Backend API for managing public complaints, worker routing, and AI priority scoring.",
    lifespan=lifespan
)

origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://ai-based-public-complaint-m-git-60314a-manishankar9ins-projects.vercel.app",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    # Any localhost dev port or Vercel preview domain for hosted frontends.
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+|https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    # Chrome private-network preflight for localhost → localhost
    allow_private_network=True,
)

from routes import complaints, auth, feedback, admin, workers, worker_auth, notifications

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(worker_auth.router, prefix="/api/worker-auth", tags=["worker-auth"])
app.include_router(complaints.router, prefix="/api/complaints", tags=["complaints"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])
app.include_router(workers.router, prefix="/api/workers", tags=["workers"])
app.include_router(feedback.router, prefix="/api/feedback", tags=["feedback"])
app.include_router(notifications.router, prefix="/api/notifications", tags=["notifications"])


@app.get("/api/health")
async def health():
    """Fast check from the browser; confirms API + Mongo when running."""
    if not db_manager.client:
        return {"status": "down", "mongodb": False, "message": "Database client not initialized"}
    try:
        await asyncio.wait_for(db_manager.client.admin.command("ping"), timeout=3.0)
        return {"status": "ok", "mongodb": True}
    except Exception as e:
        return {"status": "degraded", "mongodb": False, "message": str(e)}


@app.get("/")
def read_root():
    return {"message": "Welcome to the Smart Public Complaint Priority API"}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
