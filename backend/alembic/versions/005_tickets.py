"""create tickets and ticket_messages tables

Revision ID: 005_tickets
Revises: 004_transactions
Create Date: 2026-08-27 08:41:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '005_tickets'
down_revision = '004_transactions'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Create Enums safely
    op.execute("DO $$ BEGIN CREATE TYPE ticketpriority AS ENUM ('low', 'medium', 'high', 'urgent'); EXCEPTION WHEN duplicate_object THEN null; END $$;")
    op.execute("DO $$ BEGIN CREATE TYPE ticketstatus AS ENUM ('open', 'answered', 'customer_reply', 'closed'); EXCEPTION WHEN duplicate_object THEN null; END $$;")

    priority_enum = postgresql.ENUM('low', 'medium', 'high', 'urgent', name='ticketpriority', create_type=False)
    status_enum = postgresql.ENUM('open', 'answered', 'customer_reply', 'closed', name='ticketstatus', create_type=False)

    # 2. Create tickets table
    op.create_table(
        'tickets',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('order_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('orders.id', ondelete='SET NULL'), nullable=True),
        sa.Column('subject', sa.String(length=255), nullable=False),
        sa.Column('priority', priority_enum, nullable=False, server_default='medium'),
        sa.Column('status', status_enum, nullable=False, server_default='open'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )
    op.create_index(op.f('ix_tickets_id'), 'tickets', ['id'], unique=False)
    op.create_index(op.f('ix_tickets_user_id'), 'tickets', ['user_id'], unique=False)
    op.create_index(op.f('ix_tickets_order_id'), 'tickets', ['order_id'], unique=False)
    op.create_index(op.f('ix_tickets_status'), 'tickets', ['status'], unique=False)
    op.create_index(op.f('ix_tickets_priority'), 'tickets', ['priority'], unique=False)

    # 3. Create ticket_messages table
    op.create_table(
        'ticket_messages',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('ticket_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('tickets.id', ondelete='CASCADE'), nullable=False),
        sa.Column('sender_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('is_admin_reply', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )
    op.create_index(op.f('ix_ticket_messages_id'), 'ticket_messages', ['id'], unique=False)
    op.create_index(op.f('ix_ticket_messages_ticket_id'), 'ticket_messages', ['ticket_id'], unique=False)


def downgrade() -> None:
    op.drop_table('ticket_messages')
    op.drop_table('tickets')
    op.execute("DROP TYPE IF EXISTS ticketstatus;")
    op.execute("DROP TYPE IF EXISTS ticketpriority;")
