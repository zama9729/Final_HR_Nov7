"""Integration tests."""
import pytest
import httpx
from app.database import SessionLocal, Base, engine
from app.models import Tenant, Employee, Document
from app.ingestion import document_ingester
import uuid
import os


@pytest.fixture(scope="module")
def test_db():
    """Create test database."""
    Base.metadata.create_all(bind=engine)
    yield
    # Cleanup if needed


@pytest.fixture
def sample_tenant(test_db):
    """Create sample tenant."""
    db = SessionLocal()
    tenant = Tenant(
        id=uuid.uuid4(),
        name="Test Tenant",
        domain="test.com",
        is_active=True
    )
    db.add(tenant)
    db.commit()
    yield tenant
    db.close()


@pytest.fixture
def sample_employee(test_db, sample_tenant):
    """Create sample employee."""
    db = SessionLocal()
    employee = Employee(
        id=uuid.uuid4(),
        tenant_id=sample_tenant.id,
        employee_id="TEST001",
        email="test@test.com",
        first_name="Test",
        last_name="User",
        role="employee"
    )
    db.add(employee)
    db.commit()
    yield employee
    db.close()


def test_document_ingestion(sample_tenant):
    """Test document ingestion."""
    # Create sample text file
    test_file = "test_document.txt"
    with open(test_file, "w") as f:
        f.write("This is a test document for ingestion. It contains some sample text.")
    
    try:
        db = SessionLocal()
        doc = document_ingester.process_document(
            file_path=test_file,
            tenant_id=sample_tenant.id,
            filename="test_document.txt",
            is_confidential=False,
            db=db
        )
        
        assert doc is not None
        assert doc.ingestion_status == "completed"
        
        # Check chunks created
        from app.models import DocumentChunk
        chunks = db.query(DocumentChunk).filter(
            DocumentChunk.document_id == doc.id
        ).all()
        assert len(chunks) > 0
        
        db.close()
    finally:
        if os.path.exists(test_file):
            os.remove(test_file)

