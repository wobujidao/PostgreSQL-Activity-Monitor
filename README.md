# PostgreSQL Activity Monitor

## Описание
**PostgreSQL Activity Monitor** — инструмент для мониторинга активности PostgreSQL-серверов через веб-интерфейс. Проект состоит из бэкенда на Python (FastAPI) и фронтенда на React, позволяя пользователям легко отслеживать состояние серверов, активность баз данных и визуализировать полученные данные в виде графиков.

## Технологии

- **Бэкенд**: Python, FastAPI
- **Фронтенд**: React, React Router, Axios, React-Bootstrap, Chart.js, React-Chartjs-2
- **Запуск**: Node.js 23.9.0, NPM, Serve (или аналог)
- **Управление**: Systemd

## Установка и запуск

### Локальный запуск (разработка)

1. Клонируйте репозиторий:

```bash
git clone https://github.com/wobujidao/PostgreSQL-Activity-Monitor.git
cd PostgreSQL-Activity-Monitor/frontend/pgmon-frontend
```

2. Установите зависимости:

```bash
nvm use 23
npm install
```

3. Запустите приложение:

```bash
npm start
```

Приложение будет доступно по адресу [http://localhost:3000](http://localhost:3000).

### Запуск через службу (продакшен)

1. Соберите проект:

```bash
npm run build
```

2. Создайте службу systemd:

Создайте файл `/etc/systemd/system/pgmon-frontend.service` со следующим содержимым:

```ini
[Unit]
Description=PostgreSQL Activity Monitor Frontend
After=network.target

[Service]
ExecStart=/home/<user>/.nvm/versions/node/v23.9.0/bin/npx serve -s /path/to/build -l 3000
WorkingDirectory=/path/to/project
Restart=always
RestartSec=5s
User=<user>
Environment="PATH=/home/<user>/.nvm/versions/node/v23.9.0/bin:$PATH"

[Install]
WantedBy=multi-user.target
```

> Замените `<user>` и `/path/to/project` на собственные значения (например, `pgmonitor` и `/home/pgmonitor/pg_activity_monitor/frontend/pgmon-frontend`).

3. Запустите и активируйте службу:

```bash
sudo systemctl daemon-reload
sudo systemctl enable pgmon-frontend
sudo systemctl start pgmon-frontend
```

## Использование

- **Авторизация**: Используйте логин и пароль (например, `admin/admin`).
- **Список серверов**: На главной странице отображается список серверов с функциями добавления, редактирования и удаления.
- **Детальная информация**: Перейдите по адресу `/server/:name` для просмотра активности и графиков конкретного сервера.

## Зависимости

Проект использует следующие зависимости:

- **Фронтенд**: React, React Router, Axios, React-Bootstrap, Chart.js, React-Chartjs-2
- **Бэкенд**: Python, FastAPI (полный список см. в `backend/requirements.txt`)

## Контрибьюция

Если вы хотите внести свой вклад в развитие проекта:

1. Сделайте форк репозитория.
2. Создайте новую ветку (`git checkout -b feature/название_задачи`).
3. Сделайте изменения и коммит (`git commit -m "Описание изменений"`).
4. Отправьте изменения (`git push origin feature/название_задачи`).
5. Создайте Pull Request на GitHub.

## Лицензия

Проект распространяется под лицензией **MIT**. Подробнее смотрите в файле [LICENSE](LICENSE).