from cryptography.fernet import Fernet

key = Fernet.generate_key()
with open("/etc/pg_activity_monitor/encryption_key.key", "wb") as f:
    f.write(key)