"""SQLAlchemy models for multi-tenant RAG system."""
from sqlalchemy import Column, String, Integer, DateTime, Boolean, Text, ForeignKey, JSON, Float
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
from app.database import Base


class Tenant(Base):
    """Tenant/organization model."""
    __tablename__ = "tenants"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    domain = Column(String(255), unique=True, nullable=True)  # Made nullable for auto-creation
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    is_active = Column(Boolean, default=True)

    # Relationships
    employees = relationship("Employee", back_populates="tenant")
    documents = relationship("Document", back_populates="tenant")
    audit_logs = relationship("AuditLog", back_populates="tenant")


class Employee(Base):
    """Employee model."""
    __tablename__ = "employees"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    employee_id = Column(String(50), nullable=True)  # Employee ID within tenant (nullable for auto-creation)
    email = Column(String(255), nullable=False)
    first_name = Column(String(100))
    last_name = Column(String(100))
    role = Column(String(50), nullable=False)  # employee, manager, hr, ceo
    department = Column(String(100))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    is_active = Column(Boolean, default=True)

    # Relationships
    tenant = relationship("Tenant", back_populates="employees")
    leave_requests = relationship("LeaveRequest", foreign_keys="LeaveRequest.employee_id", back_populates="employee")
    paystubs = relationship("Paystub", back_populates="employee")


class Document(Base):
    """Document model for ingested files."""
    __tablename__ = "documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    filename = Column(String(255), nullable=False)
    file_path = Column(String(500))
    file_type = Column(String(50))  # pdf, docx, txt
    file_size = Column(Integer)  # bytes
    content_hash = Column(String(64))  # SHA-256 hash
    is_confidential = Column(Boolean, default=False)
    meta_data = Column(JSON)  # Additional metadata
    ingestion_status = Column(String(50), default="pending")  # pending, processing, completed, failed
    ingestion_job_id = Column(String(100))  # Celery job ID
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    tenant = relationship("Tenant", back_populates="documents")
    chunks = relationship("DocumentChunk", back_populates="document", cascade="all, delete-orphan")


class DocumentChunk(Base):
    """Chunked document segments with embeddings."""
    __tablename__ = "document_chunks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id"), nullable=False)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    chunk_index = Column(Integer, nullable=False)
    content = Column(Text, nullable=False)
    content_redacted = Column(Text)  # PII-redacted version
    embedding_id = Column(String(255))  # ID in vector store
    chunk_metadata = Column(JSON)  # Chunk metadata (page, section, etc.)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    document = relationship("Document", back_populates="chunks")


class LeaveRequest(Base):
    """Leave request model."""
    __tablename__ = "leave_requests"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    employee_id = Column(UUID(as_uuid=True), ForeignKey("employees.id"), nullable=False)
    from_date = Column(DateTime, nullable=False)
    to_date = Column(DateTime, nullable=False)
    reason = Column(Text)
    status = Column(String(50), default="pending")  # pending, approved, rejected
    approver_id = Column(UUID(as_uuid=True), ForeignKey("employees.id"))
    approved_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    employee = relationship("Employee", foreign_keys=[employee_id], back_populates="leave_requests")
    approver = relationship("Employee", foreign_keys=[approver_id], remote_side="Employee.id")


class Paystub(Base):
    """Paystub model."""
    __tablename__ = "paystubs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    employee_id = Column(UUID(as_uuid=True), ForeignKey("employees.id"), nullable=False)
    pay_period_start = Column(DateTime, nullable=False)
    pay_period_end = Column(DateTime, nullable=False)
    gross_pay = Column(Float)
    net_pay = Column(Float)
    deductions = Column(JSON)
    paystub_metadata = Column(JSON)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    employee = relationship("Employee", back_populates="paystubs")


class AuditLog(Base):
    """Immutable audit log for all RAG operations."""
    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("employees.id"))
    user_role = Column(String(50))
    request_id = Column(String(100), unique=True)  # Trace ID
    action = Column(String(100), nullable=False)  # query, ingest, tool_call
    query_text = Column(Text)  # Original query (PII masked)
    top_doc_ids = Column(JSON)  # Retrieved document IDs
    prompt_version = Column(String(50))
    llm_response = Column(Text)  # PII masked
    confidence_score = Column(Float)
    tool_calls = Column(JSON)  # Tool calls made
    error_message = Column(Text)
    latency_ms = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    tenant = relationship("Tenant", back_populates="audit_logs")

