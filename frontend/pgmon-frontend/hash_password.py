import bcrypt
password = "admin"  # Твой пароль
hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
print(hashed)