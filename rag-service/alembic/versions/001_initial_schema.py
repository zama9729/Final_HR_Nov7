"""Initial schema

Revision ID: 001_initial
Revises: 
Create Date: 2024-01-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '001_initial'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Tenants table
    op.create_table(
        'tenants',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('domain', sa.String(255), unique=True, nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('is_active', sa.Boolean(), default=True),
    )

    # Employees table
    op.create_table(
        'employees',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('tenants.id'), nullable=False),
        sa.Column('employee_id', sa.String(50), nullable=False),
        sa.Column('email', sa.String(255), nullable=False),
        sa.Column('first_name', sa.String(100)),
        sa.Column('last_name', sa.String(100)),
        sa.Column('role', sa.String(50), nullable=False),
        sa.Column('department', sa.String(100)),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('is_active', sa.Boolean(), default=True),
    )
    op.create_index('ix_employees_tenant_id', 'employees', ['tenant_id'])
    op.create_index('ix_employees_email', 'employees', ['email'])

    # Documents table
    op.create_table(
        'documents',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('tenants.id'), nullable=False),
        sa.Column('filename', sa.String(255), nullable=False),
        sa.Column('file_path', sa.String(500)),
        sa.Column('file_type', sa.String(50)),
        sa.Column('file_size', sa.Integer()),
        sa.Column('content_hash', sa.String(64)),
        sa.Column('is_confidential', sa.Boolean(), default=False),
        sa.Column('meta_data', postgresql.JSON()),
        sa.Column('ingestion_status', sa.String(50), default='pending'),
        sa.Column('ingestion_job_id', sa.String(100)),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_documents_tenant_id', 'documents', ['tenant_id'])

    # Document chunks table
    op.create_table(
        'document_chunks',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('document_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('documents.id'), nullable=False),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('tenants.id'), nullable=False),
        sa.Column('chunk_index', sa.Integer(), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('content_redacted', sa.Text()),
        sa.Column('embedding_id', sa.String(255)),
        sa.Column('chunk_metadata', postgresql.JSON()),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_document_chunks_tenant_id', 'document_chunks', ['tenant_id'])
    op.create_index('ix_document_chunks_document_id', 'document_chunks', ['document_id'])

    # Leave requests table
    op.create_table(
        'leave_requests',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('tenants.id'), nullable=False),
        sa.Column('employee_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('employees.id'), nullable=False),
        sa.Column('from_date', sa.DateTime(), nullable=False),
        sa.Column('to_date', sa.DateTime(), nullable=False),
        sa.Column('reason', sa.Text()),
        sa.Column('status', sa.String(50), default='pending'),
        sa.Column('approver_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('employees.id')),
        sa.Column('approved_at', sa.DateTime()),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_leave_requests_tenant_id', 'leave_requests', ['tenant_id'])
    op.create_index('ix_leave_requests_employee_id', 'leave_requests', ['employee_id'])

    # Paystubs table
    op.create_table(
        'paystubs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('tenants.id'), nullable=False),
        sa.Column('employee_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('employees.id'), nullable=False),
        sa.Column('pay_period_start', sa.DateTime(), nullable=False),
        sa.Column('pay_period_end', sa.DateTime(), nullable=False),
        sa.Column('gross_pay', sa.Float()),
        sa.Column('net_pay', sa.Float()),
        sa.Column('deductions', postgresql.JSON()),
        sa.Column('paystub_metadata', postgresql.JSON()),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_paystubs_tenant_id', 'paystubs', ['tenant_id'])
    op.create_index('ix_paystubs_employee_id', 'paystubs', ['employee_id'])

    # Audit logs table
    op.create_table(
        'audit_logs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('tenants.id'), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('employees.id')),
        sa.Column('user_role', sa.String(50)),
        sa.Column('request_id', sa.String(100), unique=True),
        sa.Column('action', sa.String(100), nullable=False),
        sa.Column('query_text', sa.Text()),
        sa.Column('top_doc_ids', postgresql.JSON()),
        sa.Column('prompt_version', sa.String(50)),
        sa.Column('llm_response', sa.Text()),
        sa.Column('confidence_score', sa.Float()),
        sa.Column('tool_calls', postgresql.JSON()),
        sa.Column('error_message', sa.Text()),
        sa.Column('latency_ms', sa.Integer()),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_audit_logs_tenant_id', 'audit_logs', ['tenant_id'])
    op.create_index('ix_audit_logs_user_id', 'audit_logs', ['user_id'])
    op.create_index('ix_audit_logs_created_at', 'audit_logs', ['created_at'])


def downgrade() -> None:
    op.drop_table('audit_logs')
    op.drop_table('paystubs')
    op.drop_table('leave_requests')
    op.drop_table('document_chunks')
    op.drop_table('documents')
    op.drop_table('employees')
    op.drop_table('tenants')

