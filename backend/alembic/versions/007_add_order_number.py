"""add order_number sequence and column

Revision ID: 007_add_order_number
Revises: 006_child_panels
Create Date: 2026-09-02 18:05:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '007_add_order_number'
down_revision: Union[str, None] = '006_child_panels'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create sequence starting at 29100001
    op.execute(sa.text("CREATE SEQUENCE IF NOT EXISTS order_number_seq START WITH 29100001;"))

    # Add order_number column with default from sequence
    op.add_column(
        'orders',
        sa.Column(
            'order_number',
            sa.Integer(),
            server_default=sa.text("nextval('order_number_seq')"),
            nullable=True
        )
    )
    # Populate existing orders if any have null
    op.execute(sa.text("UPDATE orders SET order_number = nextval('order_number_seq') WHERE order_number IS NULL;"))

    op.create_index('ix_orders_order_number', 'orders', ['order_number'], unique=True)


def downgrade() -> None:
    op.drop_index('ix_orders_order_number', table_name='orders')
    op.drop_column('orders', 'order_number')
    op.execute(sa.text("DROP SEQUENCE IF EXISTS order_number_seq;"))
