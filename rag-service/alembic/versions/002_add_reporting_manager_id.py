"""Add reporting_manager_id to employees

Revision ID: 002_add_reporting_manager_id
Revises: 001_initial
Create Date: 2024-12-22 06:15:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '002_add_reporting_manager_id'
down_revision = '001_initial'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add reporting_manager_id column to employees table
    op.add_column(
        'employees',
        sa.Column('reporting_manager_id', postgresql.UUID(as_uuid=True), nullable=True)
    )
    # Add foreign key constraint
    op.create_foreign_key(
        'fk_employees_reporting_manager',
        'employees',
        'employees',
        ['reporting_manager_id'],
        ['id']
    )
    # Add index for better query performance
    op.create_index('ix_employees_reporting_manager_id', 'employees', ['reporting_manager_id'])


def downgrade() -> None:
    op.drop_index('ix_employees_reporting_manager_id', table_name='employees')
    op.drop_constraint('fk_employees_reporting_manager', 'employees', type_='foreignkey')
    op.drop_column('employees', 'reporting_manager_id')


