# SimpleCloud

Лёгкий файловый менеджер на Node.js + Express. Без внешних баз данных — только локальная файловая система и JSON-конфиги.

## Быстрый старт

```sh
npm install
npm start
```

Открыть http://localhost:3000

**Учётные данные по умолчанию:** `admin` / `password`

При первом запуске админ создаётся автоматически. Чтобы задать свой пароль:

```sh
ADMIN_PASSWORD=MySecret npm start
```

Или вручную:

```sh
npm run create-admin -- myuser mypassword admin
```

## Скрипты

| Команда | Назначение |
|---------|------------|
| `npm start` | Запуск сервера |
| `npm run dev` | Запуск с nodemon (автоперезагрузка) |
| `npm run create-admin` | Создать пользователя |
| `node test/integration.js` | Запустить интеграционные тесты |

## Переменные окружения

| Переменная | По умолчанию | Назначение |
|------------|-------------|------------|
| `PORT` | `3000` | HTTP-порт |
| `STORAGE_DIR` | `./data` | Корень файлового хранилища |
| `CONFIG_DIR` | `./config` | Директория JSON-конфигов |
| `SESSION_TTL_HOURS` | `24` | Время жизни сессии в часах |
| `MAX_UPLOAD_MB` | `100` | Максимальный размер загрузки в МБ |
| `ADMIN_PASSWORD` | `password` | Пароль админа при первом запуске |

## HTTP API

Все методы `/api/files/*` требуют авторизации (cookie-сессия).

### Auth

| Метод | Endpoint | Описание |
|--------|----------|----------|
| `POST` | `/api/auth/login` | Войти. Тело: `{"username":"...","password":"..."}` |
| `POST` | `/api/auth/logout` | Выйти |
| `GET` | `/api/auth/me` | Текущий пользователь |

### System

| Метод | Endpoint | Описание |
|--------|----------|----------|
| `GET` | `/api/health` | Статус сервера `{"status":"ok"}` |

### Files

| Метод | Endpoint | Параметры | Описание |
|--------|----------|-----------|----------|
| `GET` | `/api/files` | `?path=&page=&pageSize=&sort=&direction=` | Список файлов с пагинацией |
| `GET` | `/api/files/download` | `?path=` | Скачать файл |
| `POST` | `/api/files/upload` | `?path=&overwrite=true` + `multipart: file` | Загрузить файл |
| `POST` | `/api/files/folder` | `{"path":"/","name":"folder"}` | Создать папку |
| `PATCH` | `/api/files/rename` | `{"path":"/old","newName":"new"}` | Переименовать |
| `DELETE` | `/api/files` | `?path=` | Удалить файл или папку |
| `POST` | `/api/files/move` | `{"sourcePath":"/a","destPath":"/b"}` | Переместить |

### Public links

| Метод | Endpoint | Параметры | Описание |
|--------|----------|-----------|----------|
| `POST` | `/api/files/publish` | `{"path":"/file.pdf"}` | Опубликовать — возвращает `publicUrl` |
| `DELETE` | `/api/files/publish` | `{"path":"/file.pdf"}` | Отозвать публичный доступ |
| `GET` | `/api/files/published` | — | Список всех опубликованных ссылок |

**Публичный доступ (без авторизации):**

| Метод | Endpoint | Описание |
|--------|----------|----------|
| `GET` | `/pub/*` | Файл — скачать, папка — HTML-листинг |
| `GET` | `/pub/*/...` | Доступ к файлам внутри опубликованной папки |

### Параметры списка файлов

| Параметр | По умолчанию | Ограничения |
|----------|-------------|-------------|
| `path` | `/` | Путь к папке |
| `page` | `1` | >= 1 |
| `pageSize` | `50` | 10-200 |
| `sort` | `name` | `name`, `size`, `modifiedAt`, `type` |
| `direction` | `asc` | `asc`, `desc` |

### Формат ответа списка

```json
{
  "path": "/docs",
  "page": 1,
  "pageSize": 50,
  "total": 124,
  "items": [
    {
      "name": "report.pdf",
      "path": "/docs/report.pdf",
      "type": "file",
      "size": 2048,
      "modifiedAt": "2026-06-23T00:00:00.000Z"
    }
  ]
}
```

### Ошибки

```json
{
  "error": {
    "code": "FILE_NOT_FOUND",
    "message": "File not found"
  }
}
```

| HTTP | Код | Когда |
|------|-----|-------|
| 400 | `INVALID_REQUEST` | Некорректные параметры |
| 401 | `UNAUTHORIZED` | Нет авторизации |
| 403 | `FORBIDDEN_PATH` | Попытка выйти за пределы storage |
| 404 | `FILE_NOT_FOUND` | Файл или папка не найдены |
| 409 | `ALREADY_EXISTS` | Конфликт имени |
| 413 | `UPLOAD_TOO_LARGE` | Файл слишком большой |
| 500 | `INTERNAL_ERROR` | Внутренняя ошибка |

## Примеры curl

```sh
# Health check
curl http://localhost:3000/api/health

# Логин (сохраняет cookie в файл)
curl -c cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"password"}'

# Список файлов
curl -b cookies.txt 'http://localhost:3000/api/files?path=/&page=1&pageSize=50'

# Создать папку
curl -b cookies.txt -X POST http://localhost:3000/api/files/folder \
  -H 'Content-Type: application/json' \
  -d '{"path":"/","name":"docs"}'

# Загрузить файл
curl -b cookies.txt -X POST 'http://localhost:3000/api/files/upload?path=/docs' \
  -F 'file=@report.pdf'

# Скачать файл
curl -b cookies.txt 'http://localhost:3000/api/files/download?path=/docs/report.pdf' \
  -o report.pdf

# Опубликовать файл (получить публичную ссылку)
curl -b cookies.txt -X POST http://localhost:3000/api/files/publish \
  -H 'Content-Type: application/json' \
  -d '{"path":"/docs/report.pdf"}'

# Скачать по публичной ссылке (без авторизации)
curl http://localhost:3000/pub/docs/report.pdf

# Отозвать публичный доступ
curl -b cookies.txt -X DELETE http://localhost:3000/api/files/publish \
  -H 'Content-Type: application/json' \
  -d '{"path":"/docs/report.pdf"}'

# Переименовать
curl -b cookies.txt -X PATCH http://localhost:3000/api/files/rename \
  -H 'Content-Type: application/json' \
  -d '{"path":"/docs/report.pdf","newName":"final.pdf"}'

# Удалить
curl -b cookies.txt -X DELETE 'http://localhost:3000/api/files?path=/docs/final.pdf'

# Выйти
curl -b cookies.txt -X POST http://localhost:3000/api/auth/logout
```

## Структура проекта

```
simplecloud2/
├── app.js                  # Passenger entry point
├── .env.example            # Пример переменных окружения
├── package.json
├── data/                   # Файловое хранилище (STORAGE_DIR)
├── config/                 # JSON-конфиги: users.json, sessions.json, public.json
├── public/                 # Статический frontend
│   ├── index.html
│   ├── app.css
│   └── app.js
├── src/
│   ├── server.js           # Точка входа + bootstrap админа
│   ├── application.js      # Express-приложение и роуты
│   ├── config.js           # Конфигурация из переменных окружения
│   ├── auth/               # Авторизация
│   │   ├── password.js     # pbkdf2 + timingSafeEqual
│   │   ├── sessions.js     # JSON-хранилище сессий
│   │   ├── userStore.js    # JSON-хранилище пользователей
│   │   └── authMiddleware.js
│   ├── files/              # Файловые операции
│   │   ├── pathSafety.js   # Защита от path traversal
│   │   ├── fileService.js  # Бизнес-логика
│   │   ├── fileRoutes.js   # HTTP-роуты + multer + publish
│   │   └── publicStore.js  # Хранилище публичных ссылок
│   └── shared/             # Утилиты
│       ├── errors.js       # ApiError + error handler
│       └── asyncRoute.js   # Обёртка для async-обработчиков
├── scripts/
│   └── create-admin.js     # CLI создание пользователя
└── test/
    └── integration.js      # Интеграционные тесты (65 шт.)
```

## Изоляция пользователей

Пользователи без роли `admin` заперты в своей домашней папке `data/homes/<username>` и не видят файлы других пользователей. Администратор видит всё хранилище целиком.

- Домашняя папка создаётся автоматически при первом входе (на `/api/auth/login`).
- Изоляция работает на уровне одного запроса: каждый `/api/files/*`-роут получает scoped-представление `FileService`, корнем которого является домашняя папка пользователя. Существующая проверка path traversal (`resolveStoragePath`) не даёт выйти за её пределы — отдельная проверка прав не нужна.
- Публичные ссылки хранятся в root-relative путях; пользователь видит только свои ссылки, переведённые обратно в home-relative вид.
- `/pub/*` дополнительно проверяет, что запрошенный путь не выходит за пределы опубликованной записи (защита от `..` внутри опубликованной папки, которая теперь может жить рядом с чужими home).

## Безопасность

- Пароли хэшируются через `pbkdf2` (100 000 итераций, SHA-512), сравнение через `timingSafeEqual`
- Cookie: `HttpOnly`, `SameSite=Lax`, `Secure` в production
- Все пути валидируются — path traversal заблокирован
- Пользователи без прав админа изолированы в `data/homes/<username>` — не видят чужие файлы
- Upload ограничен по размеру (`MAX_UPLOAD_MB`)
- Нельзя удалить или переименовать корень хранилища
- Ошибки не раскрывают абсолютные пути сервера
- JSON-конфиги записываются атомарно (tmp -> rename)
- Сессии очищаются от просроченных при старте
- Публичные ссылки: случайный токен (24 hex), недоступны без явной публикации

## Ограничения

- Один процесс Node.js (нет поддержки кластеризации)
- Без внешней БД — пользователи и сессии в JSON-файлах
- Нет WebSocket/real-time обновлений
- Symlink не обрабатываются (MVP)
