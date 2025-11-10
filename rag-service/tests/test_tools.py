"""Tests for tool functions."""
import pytest
from app.tools import ToolRegistry
from app.models import Employee, Tenant, LeaveRequest
from app.database import SessionLocal, Base, engine
from datetime import datetime, timedelta
import uuid


@pytest.fixture
def db_session():
    """Create test database session."""
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    yield db
    db.close()


@pytest.fixture
def test_tenant(db_session):
    """Create test tenant."""
    tenant = Tenant(
        id=uuid.uuid4(),
        name="Test Corp",
        domain="test.com",
        is_active=True
    )
    db_session.add(tenant)
    db_session.commit()
    return tenant


@pytest.fixture
def test_employee(db_session, test_tenant):
    """Create test employee."""
    employee = Employee(
        id=uuid.uuid4(),
        tenant_id=test_tenant.id,
        employee_id="TEST001",
        email="test@test.com",
        first_name="Test",
        last_name="User",
        role="employee"
    )
    db_session.add(employee)
    db_session.commit()
    return employee


def test_get_leave_balance(db_session, test_tenant, test_employee):
    """Test get_leave_balance tool."""
    registry = ToolRegistry(db_session)
    result = registry.get_leave_balance(
        tenant_id=str(test_tenant.id),
        employee_id=str(test_employee.id)
    )
    
    assert "annual_entitlement" in result
    assert "remaining_days" in result
    assert result["employee_id"] == str(test_employee.id)


def test_create_leave_request(db_session, test_tenant, test_employee):
    """Test create_leave_request tool."""
    registry = ToolRegistry(db_session)
    
    from_date = (datetime.now() + timedelta(days=7)).isoformat()
    to_date = (datetime.now() + timedelta(days=9)).isoformat()
    
    result = registry.create_leave_request(
        tenant_id=str(test_tenant.id),
        employee_id=str(test_employee.id),
        from_date=from_date,
        to_date=to_date,
        reason="Test leave"
    )
    
    assert "id" in result
    assert result["status"] == "pending"
    
    # Verify in database
    leave = db_session.query(LeaveRequest).filter(
        LeaveRequest.id == uuid.UUID(result["id"])
    ).first()
    assert leave is not None
    assert leave.status == "pending"

