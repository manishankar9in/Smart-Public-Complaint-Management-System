"""
n8n Workflow Integration Service for Smart Public Complaint Management System.
Allows dispatching complaint lifecycle events to n8n automation webhooks.
"""

import asyncio
import logging
from typing import Any, Dict, Optional
import urllib.request
import json

from config import settings

logger = logging.getLogger("n8n_service")


async def trigger_n8n_complaint_event(
    complaint_data: Dict[str, Any],
    event: str = "complaint_submitted",
) -> Optional[Dict[str, Any]]:
    """
    Trigger configured n8n webhook with complaint payload.
    Does not block or fail core application operations if n8n is offline.
    """
    webhook_url = (settings.N8N_WEBHOOK_URL or "").strip()
    if not webhook_url:
        logger.debug("[n8n] N8N_WEBHOOK_URL not configured — skipping webhook trigger.")
        return None

    payload = {
        "event": event,
        "complaint": complaint_data,
        "service": "SmartGov API",
    }

    def _post():
        try:
            req = urllib.request.Request(
                webhook_url,
                data=json.dumps(payload, default=str).encode("utf-8"),
                headers={"Content-Type": "application/json", "User-Agent": "SmartGov-FastAPI"},
            )
            with urllib.request.urlopen(req, timeout=5) as response:
                status_code = response.getcode()
                logger.info(f"[n8n] Webhook event '{event}' sent to n8n (status {status_code})")
                return {"status": status_code}
        except Exception as exc:
            logger.warning(f"[n8n] Webhook trigger failed for '{event}': {exc}")
            return None

    try:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, _post)
    except Exception as e:
        logger.warning(f"[n8n] Async runner error: {e}")
        return None
