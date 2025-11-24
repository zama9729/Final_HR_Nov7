"""Script to create JWT tokens for testing."""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.auth import create_access_token
import uuid

# Example: Create token for employee
tenant_id = input("Enter tenant ID (or press Enter for sample): ").strip()
if not tenant_id:
    tenant_id = str(uuid.uuid4())

user_id = input("Enter user ID (or press Enter for sample): ").strip()
if not user_id:
    user_id = str(uuid.uuid4())

email = input("Enter email: ").strip() or "test@example.com"
role = input("Enter role (employee/manager/hr/ceo): ").strip() or "employee"

token = create_access_token({
    "sub": user_id,
    "tenant_id": tenant_id,
    "email": email,
    "role": role
})

print(f"\nJWT Token:")
print(token)
print(f"\nUse in requests:")
print(f"Authorization: Bearer {token}")

