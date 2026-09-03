"""create child_panels table

Revision ID: 006_child_panels
Revises: 005_tickets
Create Date: 2026-09-01 07:45:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '006_child_panels'
down_revision = '005_tickets'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create child_panel_status_enum type safely
    conn = op.get_bind()
    conn.execute(
        sa.text("""
            DO $$ BEGIN
                CREATE TYPE child_panel_status_enum AS ENUM (
                    'pending', 'active', 'suspended', 'expired', 'terminated'
                );
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        """)
    )

    child_panel_status_enum = postgresql.ENUM(
        'pending', 'active', 'suspended', 'expired', 'terminated',
        name='child_panel_status_enum',
        create_type=False
    )

    op.create_table(
        'child_panels',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),

        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),

        sa.Column('domain', sa.String(255), nullable=False, unique=True, index=True),
        sa.Column('admin_username', sa.String(100), nullable=False),
        sa.Column('admin_password_hash', sa.String(255), nullable=False),

        sa.Column('currency', sa.String(10), server_default='KES', nullable=False),
        sa.Column('price_per_month', sa.Numeric(12, 2), server_default='1500.00', nullable=False),

        sa.Column('status', child_panel_status_enum, server_default='pending', nullable=False, index=True),

        sa.Column('nameserver1', sa.String(255), server_default='ns1.socialpulse.io', nullable=False),
        sa.Column('nameserver2', sa.String(255), server_default='ns2.socialpulse.io', nullable=False),

        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('auto_renew', sa.Boolean(), server_default=sa.text('true'), nullable=False),

        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('metadata_json', postgresql.JSONB(), nullable=True),

        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('child_panels')
    sa.Enum(name='child_panel_status_enum').drop(op.get_bind(), checkfirst=True)
