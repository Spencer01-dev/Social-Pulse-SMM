"""add fallback provider columns to services

Revision ID: 008_add_fallback_columns
Revises: 007_add_order_number
Create Date: 2026-09-08 17:46:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '008_add_fallback_columns'
down_revision: Union[str, None] = '007_add_order_number'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add fallback_provider_id FK column
    op.add_column(
        'services',
        sa.Column(
            'fallback_provider_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('providers.id', ondelete='SET NULL'),
            nullable=True
        )
    )
    # Add fallback_service_id text column
    op.add_column(
        'services',
        sa.Column(
            'fallback_service_id',
            sa.String(100),
            nullable=True
        )
    )


def downgrade() -> None:
    op.drop_column('services', 'fallback_service_id')
    op.drop_column('services', 'fallback_provider_id')
