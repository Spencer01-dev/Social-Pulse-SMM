"""add wholesale_rate column to services

Revision ID: 010_add_wholesale_rate
Revises: 009_clean_platforms_and_delix
Create Date: 2026-09-21 22:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '010_add_wholesale_rate'
down_revision: Union[str, None] = '009_clean_platforms_and_delix'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'services' AND column_name = 'wholesale_rate'
            ) THEN
                ALTER TABLE services ADD COLUMN wholesale_rate NUMERIC(12, 2) DEFAULT 0.00;
            END IF;
        END $$;
    """)


def downgrade() -> None:
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'services' AND column_name = 'wholesale_rate'
            ) THEN
                ALTER TABLE services DROP COLUMN wholesale_rate;
            END IF;
        END $$;
    """)
