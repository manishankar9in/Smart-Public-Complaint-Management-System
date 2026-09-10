import re
from typing import Optional
from math import radians, cos, sin, asin, sqrt
from difflib import SequenceMatcher
import logging

logger = logging.getLogger(__name__)


def sanitize_string(input_str: Optional[str], max_length: int = 1000) -> str:
    """Sanitize string input to prevent XSS and injection attacks."""
    if not input_str:
        return ""
    
    # Truncate to max length
    if len(input_str) > max_length:
        input_str = input_str[:max_length]
    
    # Remove potentially dangerous HTML/JS patterns
    dangerous_patterns = [
        r'<script.*?>.*?</script>',
        r'javascript:',
        r'on\w+\s*=',
        r'<iframe.*?>',
        r'<object.*?>',
        r'<embed.*?>',
    ]
    
    for pattern in dangerous_patterns:
        input_str = re.sub(pattern, '', input_str, flags=re.IGNORECASE | re.DOTALL)
    
    return input_str.strip()


def validate_email(email: str) -> bool:
    """Validate email format."""
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None


def validate_phone(phone: str) -> bool:
    """Validate Indian phone number format."""
    pattern = r'^[6-9]\d{9}$'
    return re.match(pattern, phone) is not None


def validate_coordinates(lat: float, lng: float) -> bool:
    """Validate GPS coordinates."""
    return -90 <= lat <= 90 and -180 <= lng <= 180


def validate_pincode(pincode: str) -> bool:
    """Validate Indian pincode format."""
    pattern = r'^\d{6}$'
    return re.match(pattern, pincode) is not None


def sanitize_description(description: str) -> str:
    """Sanitize complaint description."""
    return sanitize_string(description, max_length=2000)


def calculate_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great-circle distance between two points on Earth using Haversine formula.
    
    Args:
        lat1, lon1: First point coordinates (decimal degrees)
        lat2, lon2: Second point coordinates (decimal degrees)
    
    Returns:
        Distance in meters
    """
    try:
        # Convert to radians
        lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
        
        # Haversine formula
        dlat = lat2 - lat1
        dlon = lon2 - lon1
        a = sin(dlat / 2)**2 + cos(lat1) * cos(lat2) * sin(dlon / 2)**2
        c = 2 * asin(sqrt(a))
        r = 6371000  # Earth's radius in meters
        
        return c * r
    except Exception as e:
        logger.error(f"Error calculating distance: {str(e)}")
        return float('inf')


def calculate_text_similarity(text1: str, text2: str) -> float:
    """
    Calculate similarity between two texts using SequenceMatcher.
    
    Args:
        text1, text2: Strings to compare
    
    Returns:
        Similarity ratio from 0.0 to 1.0 (0 = no match, 1.0 = exact match)
    """
    try:
        if not text1 or not text2:
            return 0.0
        
        # Normalize: convert to lowercase and strip whitespace
        text1 = text1.lower().strip()
        text2 = text2.lower().strip()
        
        # Use SequenceMatcher to calculate ratio
        matcher = SequenceMatcher(None, text1, text2)
        return matcher.ratio()
    except Exception as e:
        logger.error(f"Error calculating text similarity: {str(e)}")
        return 0.0

def sanitize_address(address: str) -> str:
    """Sanitize address string."""
    return sanitize_string(address, max_length=500)
