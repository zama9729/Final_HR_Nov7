"""Tests for authentication and RBAC."""
import pytest
from app.auth import RBACPolicy, create_access_token, verify_token
from app.models import Employee, Tenant
from app.database import SessionLocal
import uuid


def test_rbac_permissions():
    """Test RBAC permission checks."""
    # Employee permissions
    assert RBACPolicy.has_permission("employee", "query") == True
    assert RBACPolicy.has_permission("employee", "create_leave_request") == True
    assert RBACPolicy.has_permission("employee", "approve_leave") == False
    
    # Manager permissions
    assert RBACPolicy.has_permission("manager", "approve_leave") == True
    assert RBACPolicy.has_permission("manager", "query") == True
    
    # HR permissions
    assert RBACPolicy.has_permission("hr", "approve_leave") == True
    assert RBACPolicy.has_permission("hr", "get_leave_balance") == True


def test_rbac_employee_data_access():
    """Test employee data access control."""
    emp1_id = uuid.uuid4()
    emp2_id = uuid.uuid4()
    
    # Employee can only access own data
    assert RBACPolicy.can_access_employee_data("employee", emp1_id, emp1_id) == True
    assert RBACPolicy.can_access_employee_data("employee", emp1_id, emp2_id) == False
    
    # Manager can access all
    assert RBACPolicy.can_access_employee_data("manager", emp1_id, emp2_id) == True
    assert RBACPolicy.can_access_employee_data("hr", emp1_id, emp2_id) == True
    assert RBACPolicy.can_access_employee_data("ceo", emp1_id, emp2_id) == True


def test_jwt_token_creation():
    """Test JWT token creation."""
    payload = {
        "sub": str(uuid.uuid4()),
        "tenant_id": str(uuid.uuid4()),
        "email": "test@example.com",
        "role": "employee"
    }
    token = create_access_token(payload)
    assert token is not None
    assert isinstance(token, str)
    assert len(token) > 0

