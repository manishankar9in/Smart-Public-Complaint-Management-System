"""ASGI entrypoint for `uvicorn server:app` (app lives in main.py)."""
from main import app

__all__ = ["app"]
