<div align="center">

# PAM Frontend

**React SPA для PostgreSQL Activity Monitor**

Веб-интерфейс системы мониторинга серверов PostgreSQL ЦБМО

<br/>

<img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=white" alt="React 19"/>
<img src="https://img.shields.io/badge/Vite-7.3-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite 7.3"/>
<img src="https://img.shields.io/badge/Tailwind_CSS-4.1-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="Tailwind CSS 4.1"/>
<img src="https://img.shields.io/badge/shadcn/ui-New_York-000000?style=for-the-badge&logo=shadcnui&logoColor=white" alt="shadcn/ui"/>

<img src="https://img.shields.io/badge/Chart.js-4.4-FF6384?style=for-the-badge&logo=chartdotjs&logoColor=white" alt="Chart.js 4.4"/>
<img src="https://img.shields.io/badge/React_Router-7.2-CA4245?style=for-the-badge&logo=reactrouter&logoColor=white" alt="React Router 7.2"/>
<img src="https://img.shields.io/badge/Axios-1.8-5A29E4?style=for-the-badge&logo=axios&logoColor=white" alt="Axios 1.8"/>
<img src="https://img.shields.io/badge/Radix_UI-Primitives-161618?style=for-the-badge&logo=radixui&logoColor=white" alt="Radix UI"/>

<img src="https://img.shields.io/badge/Lucide-Icons-F56565?style=for-the-badge&logo=lucide&logoColor=white" alt="Lucide Icons"/>
<img src="https://img.shields.io/badge/Sonner-Toasts-000000?style=for-the-badge" alt="Sonner"/>
<img src="https://img.shields.io/badge/date--fns-4.1-770C56?style=for-the-badge" alt="date-fns"/>
<img src="https://img.shields.io/badge/JavaScript-ES2024-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" alt="JavaScript"/>

<br/>
<br/>

<img src="https://img.shields.io/badge/version-2.1.0-blue?style=flat-square" alt="Version"/>
<img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License"/>
<img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js"/>

</div>

---

## Стек технологий

| Категория | Технология | Версия | Описание |
|-----------|-----------|--------|----------|
| Фреймворк | [React](https://react.dev) | 19 | UI-библиотека с хуками и Context API |
| Сборщик | [Vite](https://vite.dev) | 7.3 | Мгновенный HMR, ESBuild + Rollup |
| CSS | [Tailwind CSS](https://tailwindcss.com) | 4.1 | Utility-first CSS с CSS-переменными |
| UI-компоненты | [shadcn/ui](https://ui.shadcn.com) | New York | 18 Radix-примитивов с кастомизацией |
| Графики | [Chart.js](https://www.chartjs.org) | 4.4 | Canvas-графики временных рядов |
| HTTP-клиент | [axios](https://axios-http.com) | 1.8 | Запросы к API с JWT interceptors |
| Маршрутизация | [React Router](https://reactrouter.com) | 7.2 | SPA-роутинг с защитой маршрутов |
| Иконки | [Lucide React](https://lucide.dev) | 0.564 | 1500+ SVG-иконок как React-компоненты |
| Уведомления | [Sonner](https://sonner.emilkowal.dev) | 2.0 | Toast-уведомления (success/error/info) |
| Даты | [date-fns](https://date-fns.org) + [react-datepicker](https://reactdatepicker.com) | 4.1 / 8.4 | Форматирование и выбор диапазона дат |

## Структура проекта

```
frontend/
├── index.html                  # Точка входа HTML
├── vite.config.js              # Конфигурация Vite (порт 3000, alias @/)
├── components.json             # Конфигурация shadcn/ui
├── package.json
└── src/
    ├── main.jsx                # Точка входа React
    ├── App.jsx                 # Корневой компонент, маршрутизация, header
    ├── index.css               # Tailwind + shadcn CSS-переменные (light/dark)
    │
    ├── components/             # Страницы и бизнес-компоненты
    │   ├── Login.jsx           # Форма авторизации
    │   ├── ServerList.jsx      # Главная — список серверов с фильтрами
    │   ├── ServerDetails.jsx   # Детали сервера: графики, БД, анализ
    │   ├── ServerEdit.jsx      # Редактирование/добавление сервера
    │   ├── DatabaseDetails.jsx # Детали БД: 3 графика + статистика
    │   ├── UserManagement.jsx  # CRUD пользователей (admin)
    │   ├── SSHKeyManagement.jsx# Управление SSH-ключами
    │   ├── LoadingSpinner.jsx  # Спиннер загрузки (Loader2)
    │   ├── ScrollToTop.jsx     # Кнопка «Наверх»
    │   └── ui/                 # shadcn/ui примитивы (18 компонентов)
    │       ├── alert.jsx
    │       ├── alert-dialog.jsx
    │       ├── badge.jsx
    │       ├── button.jsx
    │       ├── card.jsx
    │       ├── dialog.jsx
    │       ├── dropdown-menu.jsx
    │       ├── input.jsx
    │       ├── label.jsx
    │       ├── pagination.jsx
    │       ├── progress.jsx
    │       ├── radio-group.jsx
    │       ├── select.jsx
    │       ├── separator.jsx
    │       ├── sonner.jsx
    │       ├── table.jsx
    │       ├── tabs.jsx
    │       └── tooltip.jsx
    │
    ├── contexts/
    │   └── auth-context.jsx    # AuthProvider — JWT lifecycle, auto-refresh
    │
    ├── hooks/
    │   └── use-auth.js         # useAuth() — доступ к AuthContext
    │
    └── lib/
        ├── api.js              # Axios instance + JWT interceptors
        ├── constants.js        # Все константы (интервалы, пагинация, ключи LS)
        ├── format.js           # Форматирование: bytes, uptime, даты, таймер
        └── utils.js            # cn() — утилита для CSS-классов (tailwind-merge)
```

## Маршруты

| Путь | Компонент | Доступ | Описание |
|------|-----------|--------|----------|
| `/` | `ServerList` | все | Список серверов с поиском и фильтрами |
| `/server/:name` | `ServerDetails` | все | Графики, таблица БД, анализ активности |
| `/server/:name/edit` | `ServerEdit` | admin, operator | Редактирование параметров сервера |
| `/server/:name/db/:db_name` | `DatabaseDetails` | все | Графики подключений, размера, коммитов |
| `/users` | `UserManagement` | admin | Управление пользователями |
| `/ssh-keys` | `SSHKeyManagement` | admin, operator | Генерация, импорт, управление SSH-ключами |

## Быстрый старт

```bash
# Установка зависимостей
npm install

# Dev-сервер (порт 3000)
npm run dev

# Production-сборка
npm run build

# Предпросмотр production-сборки
npm run preview
```

## Конфигурация

### Vite (`vite.config.js`)

- **Порт:** 3000
- **Alias:** `@` → `./src/` (используется во всех импортах)
- **allowedHosts:** `pam.cbmo.mosreg.ru` (для работы за nginx reverse proxy)
- **Build output:** `build/`

### API

URL бэкенда определяется автоматически через `window.location.origin` — отдельная настройка не нужна. В production nginx проксирует API-запросы на порт 8000.

### shadcn/ui (`components.json`)

- **Стиль:** New York
- **Базовый цвет:** Zinc
- **CSS-переменные:** включены (light + dark mode)
- **Иконки:** Lucide
- **JSX** (не TSX)

## Архитектура

### Авторизация

`AuthContext` управляет полным жизненным циклом JWT:

1. Логин через `POST /token` → токен в `localStorage`
2. Axios interceptor автоматически добавляет `Authorization: Bearer` header
3. За 5 минут до истечения — модальное окно с предложением продлить сессию
4. При истечении — модалка с повторным вводом пароля
5. При 401 от бэкенда — автоматический выход

### API-клиент (`lib/api.js`)

Централизованный axios instance с двумя interceptors:
- **Request:** добавляет JWT токен из localStorage
- **Response:** при 401 очищает токен и редиректит на логин

Все компоненты используют `api.get()`, `api.post()` и т.д. вместо прямых axios-вызовов.

### Утилиты форматирования (`lib/format.js`)

| Функция | Пример |
|---------|--------|
| `formatBytes(n)` | `1073741824` → `1.00 ГБ` |
| `formatBytesGB(n)` | `2147483648` → `2.00 ГБ` |
| `formatUptime(hours)` | `50.5` → `2 д. 2 ч. 30 мин.` |
| `formatTimestamp(iso)` | ISO → `16.02.2026, 21:00:00` |
| `formatDate(iso)` | ISO → `16.02.2026` |
| `formatTimeLeft(sec)` | `125` → `2:05` |

### Константы (`lib/constants.js`)

Все магические числа вынесены в один файл: интервалы обновления данных, параметры пагинации, критерии анализа БД, значения по умолчанию для SSH, ключи localStorage.

## Ключевые компоненты

### ServerList

Главная страница. Отображает все серверы с real-time обновлением (каждые 5 сек). Возможности:
- Поиск по имени/хосту
- Фильтрация по статусу (online/offline/error)
- Сортировка по колонкам
- Индикаторы дискового пространства (Progress bar)
- Добавление нового сервера (Dialog) с тестированием SSH-подключения

### ServerDetails

Детальная информация о сервере в 3 вкладках:
- **Обзор** — графики подключений и размера БД (Chart.js canvas), таблица баз данных с пагинацией, выбор периода (react-datepicker)
- **Анализ** — поиск неактивных баз: мёртвые, статичные подключения, низкая активность. Цветовые плитки с группировкой
- **Критерии** — настройка пороговых значений для анализа (редактирование только для admin)

### DatabaseDetails

3 графика временных рядов для выбранной БД:
- Подключения (connections)
- Размер (size MB)
- Коммиты (commits)

Статистические карточки с текущими значениями и иконками.

## UI-паттерны

| Паттерн | Реализация |
|---------|-----------|
| Уведомления | `toast()` из sonner (успех, ошибка, инфо) |
| Подтверждение удаления | `AlertDialog` (вместо `window.confirm`) |
| Модальные окна | `Dialog` (формы, настройки) |
| Загрузка | `Loader2` из lucide-react с `animate-spin` |
| Навигация | Header с `DropdownMenu` (профиль, роль, выход) |
| Статусы | `Badge` с цветовыми вариантами |
| Таблицы | shadcn `Table` + `Pagination` |

## Деплой

Frontend запускается как systemd-сервис `pgmon-frontend`:

```bash
# Статус
sudo systemctl status pgmon-frontend

# Перезапуск после изменений
sudo systemctl restart pgmon-frontend
```

Nginx проксирует `pam.cbmo.mosreg.ru:443` → `localhost:3000` (frontend) и `/api/*`, `/token`, `/servers`, `/users` и др. → `localhost:8000` (backend).

## Добавление shadcn/ui компонентов

```bash
npx shadcn@latest add <component-name>
```

Компоненты устанавливаются в `src/components/ui/`. Список доступных: https://ui.shadcn.com/docs/components
