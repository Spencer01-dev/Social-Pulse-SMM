"""create users table

Revision ID: 001_create_users_table
Revises: 
Create Date: 2026-08-26 21:40:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '001_create_users_table'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Safely create enum type only if it doesn't exist
    conn = op.get_bind()
    conn.execute(
        sa.text("""
            DO $$ BEGIN
                CREATE TYPE user_role_enum AS ENUM ('customer', 'reseller', 'admin', 'super_admin');
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        """)
    )

    user_role_enum = postgresql.ENUM(
        'customer', 'reseller', 'admin', 'super_admin',
        name='user_role_enum',
        create_type=False
    )

    op.create_table(
        'users',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('username', sa.String(length=100), nullable=False),
        sa.Column('hashed_password', sa.String(length=255), nullable=False),
        sa.Column('role', user_role_enum, nullable=False, server_default='customer'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('is_verified', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('full_name', sa.String(length=150), nullable=True),
        sa.Column('phone_number', sa.String(length=50), nullable=True),
        sa.Column('balance', sa.Numeric(precision=12, scale=2), nullable=False, server_default='0.00'),
        sa.Column('currency', sa.String(length=10), nullable=False, server_default='KES'),
        sa.Column('api_key', sa.String(length=64), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
    )

    op.create_index('ix_users_id', 'users', ['id'])
    op.create_index('ix_users_email', 'users', ['email'], unique=True)
    op.create_index('ix_users_username', 'users', ['username'], unique=True)
    op.create_index('ix_users_role', 'users', ['role'])
    op.create_index('ix_users_api_key', 'users', ['api_key'], unique=True)


def downgrade() -> None:
    op.drop_index('ix_users_api_key', table_name='users')
    op.drop_index('ix_users_role', table_name='users')
    op.drop_index('ix_users_username', table_name='users')
    op.drop_index('ix_users_email', table_name='users')
    op.drop_index('ix_users_id', table_name='users')
    op.drop_table('users')
    
    op.execute("DROP TYPE IF EXISTS user_role_enum;")
