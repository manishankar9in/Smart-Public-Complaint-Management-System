from .db import db_manager

async def init_collections():
    required_collections = [
        "users",
        "workers",
        "admins",
        "complaints",
        "worker_updates",
        "feedback",
        "notifications"
    ]

    try:
        # Get existing collection names
        existing = await db_manager.db.list_collection_names()
        
        for name in required_collections:
            if name not in existing:
                await db_manager.db.create_collection(name)
                print(f"Created collection: {name}")
            else:
                print(f"Collection {name} already exists.")
                
        print("Initialization complete.")
    except Exception as e:
        print(f"Error during collection initialization: {e}")
