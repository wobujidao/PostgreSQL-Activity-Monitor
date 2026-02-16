from fastapi import APIRouter, HTTPException, Depends, status
from app.models.user import UserCreate, UserUpdate, UserResponse, UserRole
from app.services import user_manager
from app.auth.dependencies import get_current_user
from app.models.user import User

router = APIRouter()

def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Проверка прав администратора"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав. Требуется роль администратора"
        )
    return current_user

@router.get("/users", response_model=list[UserResponse])
async def list_users(
    current_user: User = Depends(require_admin)
):
    """Получить список всех пользователей"""
    return user_manager.list_users()

@router.post("/users", response_model=UserResponse)
async def create_user(
    user_create: UserCreate,
    current_user: User = Depends(require_admin)
):
    """Создать нового пользователя"""
    try:
        return user_manager.create_user(user_create)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

@router.get("/users/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: User = Depends(get_current_user)
):
    """Получить информацию о текущем пользователе"""
    return UserResponse(
        login=current_user.login,
        role=current_user.role,
        email=current_user.email,
        created_at=current_user.created_at,
        last_login=current_user.last_login,
        is_active=current_user.is_active
    )

@router.get("/users/{username}", response_model=UserResponse)
async def get_user(
    username: str,
    current_user: User = Depends(require_admin)
):
    """Получить информацию о пользователе"""
    user = user_manager.get_user(username)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Пользователь {username} не найден"
        )
    # Преобразуем User в UserResponse
    return UserResponse(
        login=user.login,
        role=user.role,
        email=user.email,
        created_at=user.created_at,
        last_login=user.last_login,
        is_active=user.is_active
    )

@router.put("/users/{username}", response_model=UserResponse)
async def update_user(
    username: str,
    user_update: UserUpdate,
    current_user: User = Depends(require_admin)
):
    """Обновить пользователя"""
    updated_user = user_manager.update_user(username, user_update)
    if not updated_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Пользователь {username} не найден"
        )
    return updated_user

@router.delete("/users/{username}")
async def delete_user(
    username: str,
    current_user: User = Depends(require_admin)
):
    """Удалить пользователя"""
    # Нельзя удалить самого себя
    if username == current_user.login:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Нельзя удалить свою учетную запись"
        )
    
    if not user_manager.delete_user(username):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Пользователь {username} не найден"
        )
    
    return {"message": f"Пользователь {username} удален"}
