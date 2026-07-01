import re
from typing import Optional

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

def sanitize_address(address: str) -> str:
    """Sanitize address string."""
    return sanitize_string(address, max_length=500)
