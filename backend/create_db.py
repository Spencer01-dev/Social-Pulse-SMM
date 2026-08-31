import asyncio
import asyncpg

async def create_db():
    print("Connecting to PostgreSQL on port 5433...")
    conn = await asyncpg.connect(
        user="postgres",
        password="@Oscar599",
        database="postgres",
        host="localhost",
        port=5433
    )
    
    # Check if socialpulse_db exists
    exists = await conn.fetchval(
        "SELECT 1 FROM pg_database WHERE datname = 'socialpulse_db'"
    )
    if not exists:
        print("Creating database 'socialpulse_db'...")
        await conn.execute("CREATE DATABASE socialpulse_db;")
        print("🎉 Database 'socialpulse_db' created successfully!")
    else:
        print("Database 'socialpulse_db' already exists.")
    
    await conn.close()

if __name__ == "__main__":
    asyncio.run(create_db())
