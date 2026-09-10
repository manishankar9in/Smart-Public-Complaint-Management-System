from fastapi import APIRouter, HTTPException
from database.db import get_database
from database.mongo_json import mongo_to_jsonable
from datetime import datetime, timedelta
from bson import ObjectId
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/summary")
async def get_analytics_summary():
    """Get comprehensive analytics summary stored in MongoDB."""
    try:
        db = await get_database()
        
        # Get or create analytics document
        analytics = await db.analytics.find_one({"type": "daily_summary"})
        
        if not analytics:
            # Calculate initial analytics
            analytics = await calculate_initial_analytics(db)
        
        return mongo_to_jsonable(analytics)
        
    except Exception as e:
        logger.error(f"Analytics summary error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch analytics")


@router.get("/complaints-by-category")
async def get_complaints_by_category():
    """Get complaints grouped by category from MongoDB."""
    try:
        db = await get_database()
        
        # Aggregation pipeline to group by category
        pipeline = [
            {
                "$group": {
                    "_id": "$category",
                    "count": {"$sum": 1},
                    "pending": {
                        "$sum": {
                            "$cond": [
                                {"$in": ["$status", ["PENDING_ADMIN_VERIFY", "VERIFIED", "ASSIGNED_TO_WORKER", "IN_PROGRESS"]]},
                                1,
                                0
                            ]
                        }
                    },
                    "resolved": {
                        "$sum": {
                            "$cond": [{"$eq": ["$status", "RESOLVED"]}, 1, 0]
                        }
                    }
                }
            },
            {"$sort": {"count": -1}},
            {"$limit": 10}
        ]
        
        results = await db.complaints.aggregate(pipeline).to_list(length=100)
        
        formatted_results = [
            {
                "category": r["_id"] or "Other",
                "count": r["count"],
                "pending": r["pending"],
                "resolved": r["resolved"]
            }
            for r in results
        ]
        
        return formatted_results
        
    except Exception as e:
        logger.error(f"Category analytics error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch category analytics")


@router.get("/complaints-by-priority")
async def get_complaints_by_priority():
    """Get complaints grouped by priority from MongoDB."""
    try:
        db = await get_database()
        
        pipeline = [
            {
                "$group": {
                    "_id": "$priority_level",
                    "count": {"$sum": 1},
                    "resolved": {
                        "$sum": {
                            "$cond": [{"$eq": ["$status", "RESOLVED"]}, 1, 0]
                        }
                    }
                }
            },
            {"$sort": {"count": -1}}
        ]
        
        results = await db.complaints.aggregate(pipeline).to_list(length=100)
        
        formatted_results = [
            {
                "priority": r["_id"] or "Medium",
                "count": r["count"],
                "resolved": r["resolved"]
            }
            for r in results
        ]
        
        return formatted_results
        
    except Exception as e:
        logger.error(f"Priority analytics error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch priority analytics")


@router.get("/top-districts")
async def get_top_districts():
    """Get top districts by complaint volume from MongoDB."""
    try:
        db = await get_database()
        
        pipeline = [
            {
                "$group": {
                    "_id": "$city",
                    "count": {"$sum": 1},
                    "resolved": {
                        "$sum": {
                            "$cond": [{"$eq": ["$status", "RESOLVED"]}, 1, 0]
                        }
                    }
                }
            },
            {"$sort": {"count": -1}},
            {"$limit": 10}
        ]
        
        results = await db.complaints.aggregate(pipeline).to_list(length=100)
        
        formatted_results = [
            {
                "district": r["_id"] or "Unknown",
                "count": r["count"],
                "resolved": r["resolved"]
            }
            for r in results
        ]
        
        return formatted_results
        
    except Exception as e:
        logger.error(f"District analytics error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch district analytics")


@router.get("/top-workers")
async def get_top_workers():
    """Get top performing workers from MongoDB."""
    try:
        db = await get_database()
        
        pipeline = [
            {
                "$project": {
                    "name": 1,
                    "email": 1,
                    "state": 1,
                    "city": 1,
                    "complaints_solved": 1,
                    "active_tasks": 1,
                    "department": 1
                }
            },
            {"$sort": {"complaints_solved": -1}},
            {"$limit": 10}
        ]
        
        results = await db.workers.find({}).sort("complaints_solved", -1).to_list(length=100)
        
        formatted_results = [
            {
                "name": r["name"],
                "email": r["email"],
                "complaints_solved": r.get("complaints_solved", 0),
                "active_tasks": r.get("active_tasks", 0),
                "state": r.get("state", ""),
                "city": r.get("city", ""),
                "department": r.get("department", "")
            }
            for r in results
        ]
        
        return formatted_results
        
    except Exception as e:
        logger.error(f"Worker analytics error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch worker analytics")


async def calculate_initial_analytics(db):
    """Calculate and store initial analytics in MongoDB."""
    try:
        # Get total counts
        total_complaints = await db.complaints.count_documents({})
        total_workers = await db.workers.count_documents({})
        total_users = await db.users.count_documents({})
        
        # Get active complaints
        active_complaints = await db.complaints.count_documents({
            "status": {"$nin": ["RESOLVED", "CLOSED"]}
        })
        
        # Get resolved complaints
        resolved_complaints = await db.complaints.count_documents({"status": "RESOLVED"})
        
        analytics_data = {
            "type": "daily_summary",
            "total_complaints": total_complaints,
            "total_workers": total_workers,
            "total_users": total_users,
            "active_complaints": active_complaints,
            "resolved_complaints": resolved_complaints,
            "resolution_rate": (resolved_complaints / total_complaints * 100) if total_complaints > 0 else 0,
            "last_updated": datetime.utcnow()
        }
        
        # Store in MongoDB
        await db.analytics.update_one(
            {"type": "daily_summary"},
            {"$set": analytics_data},
            upsert=True
        )
        
        return analytics_data
        
    except Exception as e:
        logger.error(f"Calculate analytics error: {str(e)}")
        raise
