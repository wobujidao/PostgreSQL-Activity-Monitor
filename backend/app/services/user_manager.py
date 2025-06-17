import json
import fcntl
from typing import Optional, List
from datetime import datetime
from pathlib import Path
import bcrypt
import logging

from app.models.user import User, UserCreate, UserUpdate, UserResponse, UserRole

logger = logging.getLogger(__name__)

class UserManager:
    def __init__(self, users_file: str = '/etc/pg_activity_monitor/users.json'):
        self.users_file = Path(users_file)
        self.backup_dir = Path('/etc/pg_activity_monitor/backups')
        self._ensure_dirs()
    
    def _ensure_dirs(self):
        """Создаем необходимые директории"""
        self.users_file.parent.mkdir(parents=True, exist_ok=True)
        self.backup_dir.mkdir(parents=True, exist_ok=True)
        
        # Создаем файл если не существует
        if not self.users_file.exists():
            with open(self.users_file, 'w') as f:
                json.dump([], f)
    
    def _load_users(self) -> List[dict]:
        """Загружаем пользователей с блокировкой файла"""
        try:
            with open(self.users_file, 'r') as f:
                fcntl.flock(f.fileno(), fcntl.LOCK_SH)
                try:
                    users = json.load(f)
                finally:
                    fcntl.flock(f.fileno(), fcntl.LOCK_UN)
            return users
        except Exception as e:
            logger.error(f"Ошибка загрузки пользователей: {e}")
            return []
    
    def _save_users(self, users: List[dict]):
        """Сохраняем с блокировкой и бэкапом"""
        try:
            # Создаем бэкап если файл существует
            if self.users_file.exists():
                backup_file = self.backup_dir / f"users_{datetime.now():%Y%m%d_%H%M%S}.json"
                with open(self.users_file, 'rb') as src, open(backup_file, 'wb') as dst:
                    dst.write(src.read())
            
            # Сохраняем новую версию
            with open(self.users_file, 'w') as f:
                fcntl.flock(f.fileno(), fcntl.LOCK_EX)
                try:
                    json.dump(users, f, indent=2, default=str)
                finally:
                    fcntl.flock(f.fileno(), fcntl.LOCK_UN)
        except Exception as e:
            logger.error(f"Ошибка сохранения пользователей: {e}")
            raise
    
    def get_user(self, username: str) -> Optional[User]:
        """Получить пользователя по логину"""
        users = self._load_users()
        for user_data in users:
            if user_data.get('login') == username:
                return User(**user_data)
        return None
    
    def create_user(self, user_create: UserCreate) -> UserResponse:
        """Создать нового пользователя"""
        users = self._load_users()
        
        # Проверка существования
        if any(u.get('login') == user_create.login for u in users):
            raise ValueError(f"Пользователь {user_create.login} уже существует")
        
        # Хэшируем пароль
        hashed = bcrypt.hashpw(user_create.password.encode(), bcrypt.gensalt()).decode()
        
        # Создаем пользователя
        user_data = {
            'login': user_create.login,
            'password': hashed,
            'role': user_create.role,
            'email': user_create.email,
            'created_at': datetime.now().isoformat(),
            'is_active': True
        }
        
        users.append(user_data)
        self._save_users(users)
        
        logger.info(f"Создан пользователь: {user_create.login}")
        return UserResponse(**user_data)
    
    def update_user(self, username: str, user_update: UserUpdate) -> Optional[UserResponse]:
        """Обновить пользователя"""
        users = self._load_users()
        
        for user_data in users:
            if user_data.get('login') == username:
                # Обновляем только переданные поля
                if user_update.password is not None:
                    user_data['password'] = bcrypt.hashpw(
                        user_update.password.encode(), 
                        bcrypt.gensalt()
                    ).decode()
                
                if user_update.role is not None:
                    user_data['role'] = user_update.role
                
                if user_update.email is not None:
                    user_data['email'] = user_update.email
                
                if user_update.is_active is not None:
                    user_data['is_active'] = user_update.is_active
                
                user_data['updated_at'] = datetime.now().isoformat()
                self._save_users(users)
                
                logger.info(f"Обновлен пользователь: {username}")
                return UserResponse(**user_data)
        
        return None
    
    def delete_user(self, username: str) -> bool:
        """Удалить пользователя"""
        users = self._load_users()
        original_count = len(users)
        users = [u for u in users if u.get('login') != username]
        
        if len(users) < original_count:
            self._save_users(users)
            logger.info(f"Удален пользователь: {username}")
            return True
        
        return False
    
    def list_users(self) -> List[UserResponse]:
        """Список всех пользователей"""
        users = self._load_users()
        return [UserResponse(**u) for u in users]
    
    def update_last_login(self, username: str):
        """Обновить время последнего входа"""
        users = self._load_users()
        
        for user_data in users:
            if user_data.get('login') == username:
                user_data['last_login'] = datetime.now().isoformat()
                self._save_users(users)
                break
