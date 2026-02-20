#!/usr/bin/env python3
"""
Миграция данных из JSON-файлов в PostgreSQL.
Запуск: python3.13 scripts/migrate_files_to_pg.py
"""
import asyncio
import json
import sys
import os
from pathlib import Path
from datetime import datetime, timezone

# Add backend to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

import asyncpg

# Config
DSN = os.getenv("LOCAL_DB_DSN", "postgresql://pam:pam@/pam_stats?host=/tmp")
ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY")
FERNET_KEY_FILE = Path("/etc/pg_activity_monitor/encryption_key.key")
USERS_FILE = Path("/etc/pg_activity_monitor/users.json")
SERVERS_FILE = Path("/etc/pg_activity_monitor/servers.json")
SSH_KEYS_FILE = Path("/etc/pg_activity_monitor/ssh_keys/keys.json")

# Setup Fernet for decryption
from cryptography.fernet import Fernet, InvalidToken
fernet = None
if FERNET_KEY_FILE.exists():
    fernet = Fernet(FERNET_KEY_FILE.read_bytes())


def fernet_decrypt(value: str) -> str:
    """Decrypt Fernet-encrypted value, or return as-is if not encrypted."""
    if not value or not isinstance(value, str):
        return value or ""
    if value.startswith("gAAAAA") and fernet:
        try:
            return fernet.decrypt(value.encode()).decode()
        except InvalidToken:
            print(f"  WARNING: failed to decrypt: {value[:30]}...")
            return ""
    return value


async def migrate_users(pool):
    """Migrate users from JSON to PostgreSQL."""
    if not USERS_FILE.exists():
        print("users.json not found, skipping")
        return

    users = json.loads(USERS_FILE.read_text())
    print(f"Migrating {len(users)} users...")

    async with pool.acquire() as conn:
        for u in users:
            try:
                # Map 'password' -> 'password_hash' (it's already bcrypt hash)
                await conn.execute(
                    """
                    INSERT INTO users (login, password_hash, role, email, is_active, created_at, updated_at, last_login)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    ON CONFLICT (login) DO NOTHING
                    """,
                    u["login"],
                    u["password"],
                    u.get("role", "viewer"),
                    u.get("email"),
                    u.get("is_active", True),
                    datetime.fromisoformat(u["created_at"]) if u.get("created_at") else datetime.now(timezone.utc),
                    datetime.fromisoformat(u["updated_at"]) if u.get("updated_at") else None,
                    datetime.fromisoformat(u["last_login"]) if u.get("last_login") else None,
                )
                print(f"  + {u['login']} ({u.get('role', 'viewer')})")
            except Exception as e:
                print(f"  ERROR migrating user {u['login']}: {e}")

    count = await pool.fetchval("SELECT COUNT(*) FROM users")
    print(f"Users migrated: {count}")


async def migrate_ssh_keys(pool):
    """Migrate SSH keys from JSON+files to PostgreSQL."""
    if not SSH_KEYS_FILE.exists():
        print("ssh_keys/keys.json not found, skipping")
        return

    keys = json.loads(SSH_KEYS_FILE.read_text())
    print(f"Migrating {len(keys)} SSH keys...")

    async with pool.acquire() as conn:
        for k in keys:
            try:
                # Read and decrypt private key from file
                private_key_path = Path(k.get("private_key_path", ""))
                if not private_key_path.exists():
                    print(f"  SKIP {k['name']}: private key file not found at {private_key_path}")
                    continue

                encrypted_pem = private_key_path.read_text()
                decrypted_pem = fernet_decrypt(encrypted_pem)

                if not decrypted_pem:
                    print(f"  SKIP {k['name']}: failed to decrypt private key")
                    continue

                await conn.execute(
                    """
                    INSERT INTO ssh_keys (id, name, fingerprint, key_type, public_key, private_key_enc, created_by, created_at, has_passphrase, description)
                    VALUES ($1, $2, $3, $4, $5, pgp_sym_encrypt($6, $7), $8, $9, $10, $11)
                    ON CONFLICT (id) DO NOTHING
                    """,
                    k["id"],
                    k["name"],
                    k["fingerprint"],
                    k["key_type"],
                    k["public_key"],
                    decrypted_pem,
                    ENCRYPTION_KEY,
                    k.get("created_by", "system"),
                    datetime.fromisoformat(str(k["created_at"])) if k.get("created_at") else datetime.now(timezone.utc),
                    k.get("has_passphrase", False),
                    k.get("description"),
                )
                print(f"  + {k['name']} ({k['key_type']})")
            except Exception as e:
                print(f"  ERROR migrating SSH key {k.get('name')}: {e}")

    count = await pool.fetchval("SELECT COUNT(*) FROM ssh_keys")
    print(f"SSH keys migrated: {count}")


async def migrate_servers(pool):
    """Migrate servers from JSON to PostgreSQL."""
    if not SERVERS_FILE.exists():
        print("servers.json not found, skipping")
        return

    servers = json.loads(SERVERS_FILE.read_text())
    print(f"Migrating {len(servers)} servers...")

    async with pool.acquire() as conn:
        for s in servers:
            try:
                # Decrypt passwords from Fernet
                password = fernet_decrypt(s.get("password", ""))
                ssh_password = fernet_decrypt(s.get("ssh_password", ""))
                ssh_key_passphrase = fernet_decrypt(s.get("ssh_key_passphrase")) if s.get("ssh_key_passphrase") else None

                # Шифруем пароли отдельно, чтобы asyncpg определил типы
                pwd_enc = None
                if password:
                    pwd_enc = await conn.fetchval(
                        "SELECT pgp_sym_encrypt($1, $2)::text", password, ENCRYPTION_KEY
                    )
                ssh_pwd_enc = None
                if ssh_password:
                    ssh_pwd_enc = await conn.fetchval(
                        "SELECT pgp_sym_encrypt($1, $2)::text", ssh_password, ENCRYPTION_KEY
                    )
                passphrase_enc = None
                if ssh_key_passphrase:
                    passphrase_enc = await conn.fetchval(
                        "SELECT pgp_sym_encrypt($1, $2)::text", ssh_key_passphrase, ENCRYPTION_KEY
                    )

                await conn.execute(
                    """
                    INSERT INTO servers (name, host, port, pg_user, password_enc, ssh_user, ssh_password_enc, ssh_port, ssh_auth_type, ssh_key_id, ssh_key_passphrase_enc)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                    ON CONFLICT (name) DO NOTHING
                    """,
                    s["name"],
                    s["host"],
                    s.get("port", 5432),
                    s["user"],
                    pwd_enc,
                    s.get("ssh_user", ""),
                    ssh_pwd_enc,
                    s.get("ssh_port", 22),
                    s.get("ssh_auth_type", "password"),
                    s.get("ssh_key_id"),
                    passphrase_enc,
                )
                print(f"  + {s['name']} ({s['host']}:{s.get('port', 5432)})")
            except Exception as e:
                print(f"  ERROR migrating server {s['name']}: {e}")

    count = await pool.fetchval("SELECT COUNT(*) FROM servers")
    print(f"Servers migrated: {count}")


async def main():
    if not ENCRYPTION_KEY:
        print("ERROR: ENCRYPTION_KEY not set! Check .env file.")
        sys.exit(1)

    print(f"Connecting to {DSN.split('@')[1] if '@' in DSN else DSN}...")
    pool = await asyncpg.create_pool(DSN, min_size=1, max_size=3)

    # Ensure pgcrypto
    async with pool.acquire() as conn:
        await conn.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    try:
        # SSH keys first (servers reference them via FK)
        await migrate_ssh_keys(pool)
        await migrate_servers(pool)
        await migrate_users(pool)

        print("\n=== Migration complete ===")

        # Verify
        async with pool.acquire() as conn:
            users = await conn.fetchval("SELECT COUNT(*) FROM users")
            servers = await conn.fetchval("SELECT COUNT(*) FROM servers")
            ssh_keys = await conn.fetchval("SELECT COUNT(*) FROM ssh_keys")
            print(f"Users: {users}, Servers: {servers}, SSH keys: {ssh_keys}")
    finally:
        await pool.close()


if __name__ == "__main__":
    asyncio.run(main())
