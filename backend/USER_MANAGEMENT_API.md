# API управления пользователями

## Роли пользователей

- **admin** - полный доступ, может управлять пользователями
- **operator** - может управлять серверами и выполнять операции
- **viewer** - только просмотр информации

## Endpoints

### Получить информацию о текущем пользователе
```
GET /users/me
Authorization: Bearer {token}
```

**Ответ:**
```json
{
    "login": "admin",
    "role": "admin",
    "email": null,
    "created_at": null,
    "last_login": null,
    "is_active": true
}
```

### Получить список всех пользователей (только admin)
```
GET /users
Authorization: Bearer {token}
```

**Ответ:**
```json
[
    {
        "login": "admin",
        "role": "admin",
        "email": null,
        "created_at": null,
        "last_login": null,
        "is_active": true
    },
    {
        "login": "operator1",
        "role": "operator",
        "email": "operator@example.com",
        "created_at": "2025-06-18T09:14:41.707282",
        "last_login": null,
        "is_active": true
    }
]
```

### Создать пользователя (только admin)
```
POST /users
Authorization: Bearer {token}
Content-Type: application/json

{
  "login": "username",
  "password": "password",
  "role": "viewer|operator|admin",
  "email": "email@example.com"
}
```

**Ответ:**
```json
{
    "login": "username",
    "role": "viewer",
    "email": "email@example.com",
    "created_at": "2025-06-18T09:14:41.707282",
    "last_login": null,
    "is_active": true
}
```

### Получить информацию о пользователе (только admin)
```
GET /users/{username}
Authorization: Bearer {token}
```

**Ответ:**
```json
{
    "login": "username",
    "role": "viewer",
    "email": "email@example.com",
    "created_at": "2025-06-18T09:14:41.707282",
    "last_login": "2025-06-18T10:00:00.000000",
    "is_active": true
}
```

### Обновить пользователя (только admin)
```
PUT /users/{username}
Authorization: Bearer {token}
Content-Type: application/json

{
  "password": "new_password",
  "role": "viewer|operator|admin",
  "email": "new@example.com",
  "is_active": true|false
}
```

**Ответ:**
```json
{
    "login": "username",
    "role": "operator",
    "email": "new@example.com",
    "created_at": "2025-06-18T09:14:41.707282",
    "last_login": "2025-06-18T10:00:00.000000",
    "is_active": true
}
```

### Удалить пользователя (только admin)
```
DELETE /users/{username}
Authorization: Bearer {token}
```

**Ответ:**
```json
{
    "message": "Пользователь username удален"
}
```

## Коды ошибок

- **401 Unauthorized** - отсутствует или невалидный токен
- **403 Forbidden** - недостаточно прав (требуется роль admin)
- **404 Not Found** - пользователь не найден
- **400 Bad Request** - неверные данные или попытка удалить себя

## Примеры использования

### Получение токена авторизации
```bash
TOKEN=$(curl -s -X POST http://localhost:8000/token \
  -d "username=admin&password=admin" \
  -H "Content-Type: application/x-www-form-urlencoded" | \
  python3 -c "import sys, json; print(json.load(sys.stdin)['access_token'])")
```

### Создание оператора
```bash
curl -X POST http://localhost:8000/users \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"login": "operator1", "password": "secure_pass", "role": "operator"}'
```

### Изменение роли пользователя
```bash
curl -X PUT http://localhost:8000/users/operator1 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"role": "admin"}'
```

### Деактивация пользователя
```bash
curl -X PUT http://localhost:8000/users/operator1 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"is_active": false}'
```

### Смена пароля пользователя
```bash
curl -X PUT http://localhost:8000/users/operator1 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"password": "new_secure_password"}'
```

### Удаление пользователя
```bash
curl -X DELETE http://localhost:8000/users/operator1 \
  -H "Authorization: Bearer $TOKEN"
```

## Структура файла users.json

Пользователи хранятся в файле `/etc/pg_activity_monitor/users.json`:

```json
[
    {
        "login": "admin",
        "password": "$2b$12$...", // bcrypt hash
        "role": "admin",
        "email": null,
        "created_at": "2025-06-18T09:00:00.000000",
        "last_login": "2025-06-18T10:00:00.000000",
        "is_active": true
    }
]
```