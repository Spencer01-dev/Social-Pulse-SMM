import asyncio
import asyncpg

async def check():
    ports = [5432, 5433, 5434]
    users = ["postgres", "careflow"]
    passwords = ["postgres", "@Oscar599", "Oscar599", "admin", "123456", ""]

    print("Scanning PostgreSQL ports and credentials...")
    for port in ports:
        for u in users:
            for p in passwords:
                try:
                    conn = await asyncpg.connect(
                        user=u,
                        password=p,
                        database="postgres",
                        host="localhost",
                        port=port,
                        timeout=2
                    )
                    print(f"\n==========================================")
                    print(f"🎉 FOUND WORKING SERVER!")
                    print(f"Port: {port}")
                    print(f"User: {u}")
                    print(f"Password: {p}")
                    print(f"==========================================")
                    await conn.close()
                    return port, u, p
                except asyncpg.exceptions.InvalidPasswordError:
                    pass
                except (ConnectionRefusedError, OSError):
                    break
                except Exception as e:
                    pass
    print("\nCould not connect automatically.")
    return None

if __name__ == "__main__":
    asyncio.run(check())
