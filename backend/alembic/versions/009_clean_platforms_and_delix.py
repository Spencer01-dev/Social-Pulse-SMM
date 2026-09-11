"""clean platforms and deactivate delix internal packages

Revision ID: 009_clean_platforms_and_delix
Revises: 008_add_fallback_columns
Create Date: 2026-09-11 22:07:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '009_clean_platforms_and_delix'
down_revision: Union[str, None] = '008_add_fallback_columns'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Deactivate any provider-internal Delix VIP packages
    op.execute("""
        UPDATE services 
        SET is_active = false 
        WHERE name ILIKE '%delix%' OR category ILIKE '%delix%';
    """)

    # 2. Correct TikTok platform
    op.execute("""
        UPDATE services 
        SET platform = 'tiktok' 
        WHERE (name ILIKE '%tiktok%' OR category ILIKE '%tiktok%' OR name ILIKE '%tik tok%' OR category ILIKE '%tik tok%');
    """)

    # 3. Correct Instagram platform
    op.execute("""
        UPDATE services 
        SET platform = 'instagram' 
        WHERE (name ILIKE '%instagram%' OR category ILIKE '%instagram%' OR name ILIKE '%ig %' OR category ILIKE '%ig %' OR name ILIKE '%reels%' OR category ILIKE '%reels%')
        AND platform != 'tiktok';
    """)

    # 4. Correct Facebook platform
    op.execute("""
        UPDATE services 
        SET platform = 'facebook' 
        WHERE (name ILIKE '%facebook%' OR category ILIKE '%facebook%' OR name ILIKE '%fb %' OR category ILIKE '%fb %')
        AND platform NOT IN ('tiktok', 'instagram');
    """)

    # 5. Correct YouTube platform
    op.execute("""
        UPDATE services 
        SET platform = 'youtube' 
        WHERE (name ILIKE '%youtube%' OR category ILIKE '%youtube%' OR name ILIKE '%yt %' OR category ILIKE '%yt %')
        AND platform NOT IN ('tiktok', 'instagram', 'facebook');
    """)

    # 6. Correct Telegram platform
    op.execute("""
        UPDATE services 
        SET platform = 'telegram' 
        WHERE (name ILIKE '%telegram%' OR category ILIKE '%telegram%' OR name ILIKE '%tg %' OR category ILIKE '%tg %')
        AND platform NOT IN ('tiktok', 'instagram', 'facebook', 'youtube');
    """)

    # 7. Correct Twitter platform
    op.execute("""
        UPDATE services 
        SET platform = 'twitter' 
        WHERE (name ILIKE '%twitter%' OR category ILIKE '%twitter%' OR name ILIKE '%tweet%' OR category ILIKE '%tweet%')
        AND platform NOT IN ('tiktok', 'instagram', 'facebook', 'youtube', 'telegram');
    """)


def downgrade() -> None:
    pass
