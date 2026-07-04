import json
import urllib.request

req = urllib.request.Request(
    'http://127.0.0.1:8000/api/auth/admin-login',
    data=json.dumps({'email': 'admin@municipality.gov', 'password': 'Admin@12345'}).encode(),
    headers={'Content-Type': 'application/json'},
    method='POST',
)

try:
    with urllib.request.urlopen(req, timeout=10) as response:
        print(response.status)
        print(response.read().decode())
except Exception as exc:
    print(type(exc).__name__, exc)
