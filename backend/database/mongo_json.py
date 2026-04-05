"""Recursively convert BSON types so FastAPI can JSON-encode MongoDB documents."""

from bson import ObjectId
from bson.decimal128 import Decimal128


def mongo_to_jsonable(obj):
    if obj is None:
        return None
    if isinstance(obj, ObjectId):
        return str(obj)
    if isinstance(obj, Decimal128):
        return float(obj.to_decimal())
    if isinstance(obj, dict):
        return {k: mongo_to_jsonable(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [mongo_to_jsonable(v) for v in obj]
    if isinstance(obj, tuple):
        return tuple(mongo_to_jsonable(v) for v in obj)
    return obj
