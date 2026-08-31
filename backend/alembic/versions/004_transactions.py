"""create transactions table

Revision ID: 004_transactions
Revises: 003_orders
Create Date: 2026-08-27 02:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '004_transactions'
down_revision: Union[str, None] = '003_orders'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create Enums safely
    conn = op.get_bind()
    conn.execute(
        sa.text("""
            DO $$ BEGIN
                CREATE TYPE transaction_type_enum AS ENUM (
                    'deposit', 'order_payment', 'order_refund',
                    'manual_adjustment', 'bonus'
                );
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        """)
    )

    conn.execute(
        sa.text("""
            DO $$ BEGIN
                CREATE TYPE payment_method_enum AS ENUM (
                    'mpesa', 'okx', 'binance', 'manual', 'internal'
                );
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        """)
    )

    conn.execute(
        sa.text("""
            DO $$ BEGIN
                CREATE TYPE transaction_status_enum AS ENUM (
                    'pending', 'completed', 'failed', 'reversed'
                );
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        """)
    )

    transaction_type_enum = postgresql.ENUM(
        'deposit', 'order_payment', 'order_refund',
        'manual_adjustment', 'bonus',
        name='transaction_type_enum',
        create_type=False
    )

    payment_method_enum = postgresql.ENUM(
        'mpesa', 'okx', 'binance', 'manual', 'internal',
        name='payment_method_enum',
        create_type=False
    )

    transaction_status_enum = postgresql.ENUM(
        'pending', 'completed', 'failed', 'reversed',
        name='transaction_status_enum',
        create_type=False
    )

    # 2. Create Transactions Table
    op.create_table(
        'transactions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('order_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('orders.id', ondelete='SET NULL'), nullable=True),
        sa.Column('type', transaction_type_enum, nullable=False),
        sa.Column('amount', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('balance_before', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('balance_after', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('currency', sa.String(length=10), nullable=False, server_default='KES'),
        sa.Column('payment_method', payment_method_enum, nullable=False, server_default='internal'),
        sa.Column('payment_reference', sa.String(length=100), nullable=True),
        sa.Column('status', transaction_status_enum, nullable=False, server_default='pending'),
        sa.Column('description', sa.String(length=255), nullable=True),
        sa.Column('metadata_json', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
    )

    op.create_index('ix_transactions_id', 'transactions', ['id'])
    op.create_index('ix_transactions_user_id', 'transactions', ['user_id'])
    op.create_index('ix_transactions_order_id', 'transactions', ['order_id'])
    op.create_index('ix_transactions_type', 'transactions', ['type'])
    op.create_index('ix_transactions_payment_method', 'transactions', ['payment_method'])
    op.create_index('ix_transactions_payment_reference', 'transactions', ['payment_reference'])
    op.create_index('ix_transactions_status', 'transactions', ['status'])


def downgrade() -> None:
    op.drop_index('ix_transactions_status', table_name='transactions')
    op.drop_index('ix_transactions_payment_reference', table_name='transactions')
    op.drop_index('ix_transactions_payment_method', table_name='transactions')
    op.drop_index('ix_transactions_type', table_name='transactions')
    op.drop_index('ix_transactions_order_id', table_name='transactions')
    op.drop_index('ix_transactions_user_id', table_name='transactions')
    op.drop_index('ix_transactions_id', table_name='transactions')
    op.drop_table('transactions')

    op.execute("DROP TYPE IF EXISTS transaction_type_enum;")
    op.execute("DROP TYPE IF EXISTS payment_method_enum;")
    op.execute("DROP TYPE IF EXISTS transaction_status_enum;")
