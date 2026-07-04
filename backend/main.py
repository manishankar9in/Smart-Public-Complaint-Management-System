import asyncio
import logging
import time
from collections import defaultdict
from contextlib import asynccontextmanager
from starlette.middleware.base import BaseHTTPMiddleware

import uvicorn
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from database.db import close_mongo_connection, connect_to_mongo, db_manager
from database.db_init import init_collections

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
    ]
)
logger = logging.getLogger(__name__)

# Simple in-memory rate limiter
class RateLimiter:
    def __init__(self):
        self.requests = defaultdict(list)
        self.max_requests = 100  # requests per minute
        self.window = 60  # seconds

    def is_allowed(self, client_id: str) -> bool:
        now = time.time()
        # Clean old requests
        self.requests[client_id] = [
            req_time for req_time in self.requests[client_id]
            if now - req_time < self.window
        ]
        # Check if under limit
        if len(self.requests[client_id]) >= self.max_requests:
            return False
        self.requests[client_id].append(now)
        return True

rate_limiter = RateLimiter()

class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    """Middleware to limit request body size to prevent large payload attacks."""
    def __init__(self, app, max_size: int = 15 * 1024 * 1024):  # 15MB default
        super().__init__(app)
        self.max_size = max_size

    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get('content-length')
        if content_length and int(content_length) > self.max_size:
            logger.warning(f"Request too large: {content_length} bytes")
            raise HTTPException(status_code=413, detail="Request body too large. Maximum size is 15MB.")
        return await call_next(request)

class RateLimitMiddleware(BaseHTTPMiddleware):
    """Middleware to rate limit requests by IP address."""
    async def dispatch(self, request: Request, call_next):
        # Get client IP
        client_ip = request.client.host if request.client else "unknown"
        
        # Skip rate limiting for health check
        if request.url.path == "/api/health":
            return await call_next(request)
        
        if not rate_limiter.is_allowed(client_ip):
            logger.warning(f"Rate limit exceeded for IP: {client_ip}")
            raise HTTPException(
                status_code=429,
                detail="Too many requests. Please wait and try again later.",
                headers={"Retry-After": "60"}
            )
        
        return await call_next(request)

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Middleware to add security headers (Helmet-like)."""
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        
        # Security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), camera=(), microphone=()"
        
        # Content Security Policy (basic)
        response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://*.vercel.app https://*.googleapis.com;"
        
        return response

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting application lifespan...")
    try:
        connected = await connect_to_mongo()
        if connected:
            try:
                await asyncio.wait_for(init_collections(), timeout=25.0)
            except asyncio.TimeoutError:
                logger.warning("Collection init timed out — check MongoDB.")
            except Exception as e:
                logger.warning(f"Collection init failed: {e}")
        else:
            logger.warning("MongoDB unavailable; continuing without database initialization.")
    except Exception as exc:
        logger.warning(f"MongoDB unavailable during startup: {exc}")
    logger.info("Application started successfully")
    yield
    logger.info("Shutting down application...")
    await close_mongo_connection()

app = FastAPI(
    title="Smart Public Complaint Priority and Response System API",
    description="Backend API for managing public complaints, worker routing, and AI priority scoring.",
    lifespan=lifespan
)

origins = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://smartcomplainx.vercel.app",
    "https://www.smartcomplainx.vercel.app",
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

# Add request size limit middleware (15MB max)
app.add_middleware(RequestSizeLimitMiddleware, max_size=15 * 1024 * 1024)

# Add rate limiting middleware
app.add_middleware(RateLimitMiddleware)

# Add security headers middleware
app.add_middleware(SecurityHeadersMiddleware)

from routes import complaints, auth, feedback, admin, workers, worker_auth, notifications, analytics

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(worker_auth.router, prefix="/api/worker-auth", tags=["worker-auth"])
app.include_router(complaints.router, prefix="/api/complaints", tags=["complaints"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])
app.include_router(workers.router, prefix="/api/workers", tags=["workers"])
app.include_router(feedback.router, prefix="/api/feedback", tags=["feedback"])
app.include_router(notifications.router, prefix="/api/notifications", tags=["notifications"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["analytics"])


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
