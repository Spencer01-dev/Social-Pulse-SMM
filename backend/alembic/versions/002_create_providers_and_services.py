"""create providers and services tables

Revision ID: 002_services
Revises: 001_create_users_table
Create Date: 2026-08-27 00:10:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '002_services'
down_revision: Union[str, None] = '001_create_users_table'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create Enums safely
    conn = op.get_bind()
    conn.execute(
        sa.text("""
            DO $$ BEGIN
                CREATE TYPE platform_enum AS ENUM (
                    'instagram', 'facebook', 'youtube', 'tiktok', 'twitter',
                    'telegram', 'spotify', 'discord', 'twitch', 'other'
                );
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        """)
    )

    conn.execute(
        sa.text("""
            DO $$ BEGIN
                CREATE TYPE markup_type_enum AS ENUM ('percentage', 'fixed_amount', 'manual');
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        """)
    )

    platform_enum = postgresql.ENUM(
        'instagram', 'facebook', 'youtube', 'tiktok', 'twitter',
        'telegram', 'spotify', 'discord', 'twitch', 'other',
        name='platform_enum',
        create_type=False
    )

    markup_type_enum = postgresql.ENUM(
        'percentage', 'fixed_amount', 'manual',
        name='markup_type_enum',
        create_type=False
    )

    # 2. Create Providers Table
    op.create_table(
        'providers',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('slug', sa.String(length=50), nullable=False),
        sa.Column('api_url', sa.String(length=255), nullable=False),
        sa.Column('api_key_encrypted', sa.String(length=255), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('balance', sa.Numeric(precision=12, scale=2), nullable=False, server_default='0.00'),
        sa.Column('currency', sa.String(length=10), nullable=False, server_default='USD'),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
    )
    op.create_index('ix_providers_id', 'providers', ['id'])
    op.create_index('ix_providers_slug', 'providers', ['slug'], unique=True)

    # 3. Create Services Table
    op.create_table(
        'services',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('provider_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('providers.id', ondelete='SET NULL'), nullable=True),
        sa.Column('provider_service_id', sa.String(length=100), nullable=False),
        sa.Column('platform', platform_enum, nullable=False, server_default='instagram'),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('service_type', sa.String(length=50), nullable=False, server_default='Default'),
        sa.Column('category', sa.String(length=150), nullable=False),
        sa.Column('provider_rate', sa.Numeric(precision=12, scale=2), nullable=False, server_default='0.00'),
        sa.Column('selling_rate', sa.Numeric(precision=12, scale=2), nullable=False, server_default='0.00'),
        sa.Column('markup_type', markup_type_enum, nullable=False, server_default='percentage'),
        sa.Column('markup_value', sa.Numeric(precision=10, scale=2), nullable=False, server_default='100.00'),
        sa.Column('min_quantity', sa.Integer(), nullable=False, server_default='10'),
        sa.Column('max_quantity', sa.Integer(), nullable=False, server_default='100000'),
        sa.Column('refill_available', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('cancel_available', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
    )
    op.create_index('ix_services_id', 'services', ['id'])
    op.create_index('ix_services_provider_id', 'services', ['provider_id'])
    op.create_index('ix_services_provider_service_id', 'services', ['provider_service_id'])
    op.create_index('ix_services_platform', 'services', ['platform'])
    op.create_index('ix_services_category', 'services', ['category'])
    op.create_index('ix_services_is_active', 'services', ['is_active'])


def downgrade() -> None:
    op.drop_index('ix_services_is_active', table_name='services')
    op.drop_index('ix_services_category', table_name='services')
    op.drop_index('ix_services_platform', table_name='services')
    op.drop_index('ix_services_provider_service_id', table_name='services')
    op.drop_index('ix_services_provider_id', table_name='services')
    op.drop_index('ix_services_id', table_name='services')
    op.drop_table('services')

    op.drop_index('ix_providers_slug', table_name='providers')
    op.drop_index('ix_providers_id', table_name='providers')
    op.drop_table('providers')

    op.execute("DROP TYPE IF EXISTS platform_enum;")
    op.execute("DROP TYPE IF EXISTS markup_type_enum;")
