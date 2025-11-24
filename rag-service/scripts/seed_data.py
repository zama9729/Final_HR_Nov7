"""Seed script for sample data."""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from sqlalchemy.orm import Session
from app.database import SessionLocal, engine, Base
from app.models import Tenant, Employee, Paystub, LeaveRequest
from datetime import datetime, timedelta
import uuid

# Create tables
Base.metadata.create_all(bind=engine)


def seed_data():
    """Seed sample data."""
    db = SessionLocal()
    
    try:
        # Create tenant
        tenant = Tenant(
            id=uuid.uuid4(),
            name="Acme Corporation",
            domain="acme.com",
            is_active=True
        )
        db.add(tenant)
        db.commit()
        db.refresh(tenant)
        print(f"Created tenant: {tenant.id} - {tenant.name}")
        
        # Create employees
        employees_data = [
            {
                "employee_id": "EMP001",
                "email": "john.doe@acme.com",
                "first_name": "John",
                "last_name": "Doe",
                "role": "employee",
                "department": "Engineering"
            },
            {
                "employee_id": "EMP002",
                "email": "jane.smith@acme.com",
                "first_name": "Jane",
                "last_name": "Smith",
                "role": "manager",
                "department": "Engineering"
            },
            {
                "employee_id": "EMP003",
                "email": "hr@acme.com",
                "first_name": "HR",
                "last_name": "Manager",
                "role": "hr",
                "department": "HR"
            },
            {
                "employee_id": "EMP004",
                "email": "ceo@acme.com",
                "first_name": "CEO",
                "last_name": "Executive",
                "role": "ceo",
                "department": "Executive"
            }
        ]
        
        employees = []
        for emp_data in employees_data:
            employee = Employee(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                **emp_data
            )
            db.add(employee)
            employees.append(employee)
        
        db.commit()
        for emp in employees:
            db.refresh(emp)
            print(f"Created employee: {emp.id} - {emp.email} ({emp.role})")
        
        # Create sample paystubs
        emp1 = employees[0]
        for i in range(3):
            paystub = Paystub(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                employee_id=emp1.id,
                pay_period_start=datetime.now() - timedelta(days=30 * (i + 1)),
                pay_period_end=datetime.now() - timedelta(days=30 * i),
                gross_pay=5000.0 + (i * 100),
                net_pay=4000.0 + (i * 80),
                deductions={"tax": 1000.0, "insurance": 200.0}
            )
            db.add(paystub)
        
        db.commit()
        print("Created 3 sample paystubs")
        
        # Create sample leave request
        leave_request = LeaveRequest(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            employee_id=emp1.id,
            from_date=datetime.now() + timedelta(days=7),
            to_date=datetime.now() + timedelta(days=9),
            reason="Family vacation",
            status="pending"
        )
        db.add(leave_request)
        db.commit()
        print("Created sample leave request")
        
        print("\n✅ Seed data created successfully!")
        print(f"\nSample JWT tokens (use these for testing):")
        print(f"\nEmployee token (John Doe):")
        from app.auth import create_access_token
        emp_token = create_access_token({
            "sub": str(emp1.id),
            "tenant_id": str(tenant.id),
            "email": emp1.email,
            "role": emp1.role
        })
        print(emp_token)
        
        print(f"\nManager token (Jane Smith):")
        manager_token = create_access_token({
            "sub": str(employees[1].id),
            "tenant_id": str(tenant.id),
            "email": employees[1].email,
            "role": employees[1].role
        })
        print(manager_token)
        
    except Exception as e:
        print(f"Error seeding data: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_data()

