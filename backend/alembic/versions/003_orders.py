"""create orders table

Revision ID: 003_orders
Revises: 002_services
Create Date: 2026-08-27 01:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '003_orders'
down_revision: Union[str, None] = '002_services'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create OrderStatus Enum safely
    conn = op.get_bind()
    conn.execute(
        sa.text("""
            DO $$ BEGIN
                CREATE TYPE order_status_enum AS ENUM (
                    'pending', 'processing', 'in_progress', 'completed',
                    'partial', 'canceled', 'failed'
                );
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        """)
    )

    order_status_enum = postgresql.ENUM(
        'pending', 'processing', 'in_progress', 'completed',
        'partial', 'canceled', 'failed',
        name='order_status_enum',
        create_type=False
    )

    # 2. Create Orders Table
    op.create_table(
        'orders',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('service_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('services.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('provider_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('providers.id', ondelete='SET NULL'), nullable=True),
        sa.Column('provider_order_id', sa.String(length=100), nullable=True),
        sa.Column('target_link', sa.String(length=500), nullable=False),
        sa.Column('quantity', sa.Integer(), nullable=False),
        sa.Column('start_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('remains', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('charge', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('provider_cost', sa.Numeric(precision=12, scale=2), nullable=False, server_default='0.00'),
        sa.Column('profit', sa.Numeric(precision=12, scale=2), nullable=False, server_default='0.00'),
        sa.Column('currency', sa.String(length=10), nullable=False, server_default='KES'),
        sa.Column('status', order_status_enum, nullable=False, server_default='pending'),
        sa.Column('custom_comments', sa.Text(), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('runs', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('interval', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
    )

    op.create_index('ix_orders_id', 'orders', ['id'])
    op.create_index('ix_orders_user_id', 'orders', ['user_id'])
    op.create_index('ix_orders_service_id', 'orders', ['service_id'])
    op.create_index('ix_orders_provider_id', 'orders', ['provider_id'])
    op.create_index('ix_orders_provider_order_id', 'orders', ['provider_order_id'])
    op.create_index('ix_orders_status', 'orders', ['status'])


def downgrade() -> None:
    op.drop_index('ix_orders_status', table_name='orders')
    op.drop_index('ix_orders_provider_order_id', table_name='orders')
    op.drop_index('ix_orders_provider_id', table_name='orders')
    op.drop_index('ix_orders_service_id', table_name='orders')
    op.drop_index('ix_orders_user_id', table_name='orders')
    op.drop_index('ix_orders_id', table_name='orders')
    op.drop_table('orders')

    op.execute("DROP TYPE IF EXISTS order_status_enum;")
