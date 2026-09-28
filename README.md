# SimpleCloud

Лёгкий файловый менеджер на Node.js + Express. Без внешних баз данных — только локальная файловая система и JSON-конфиги.

## Быстрый старт

```sh
npm install
npm start
```

Открыть http://localhost:3001

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
| `PORT` | `3001` | HTTP-порт |
| `STORAGE_DIR` | `./data` | Корень файлового хранилища |
| `CONFIG_DIR` | `./config` | Директория JSON-конфигов |
| `SESSION_TTL_HOURS` | `24` | Время жизни сессии в часах |
| `MAX_UPLOAD_MB` | `100` | Максимальный размер **одного файла** в МБ (файлы больше `UPLOAD_CHUNK_MB` грузятся слайсами, поэтому 900 для видео с телефона — нормально) |
| `UPLOAD_CHUNK_MB` | `8` | Размер слайса для больших файлов, МБ. Каждый слайс — отдельный короткий запрос |
| `REQUEST_TIMEOUT_MS` | `900000` | Сколько сервер ждёт прогресса на соединении, мс (`0` — без лимита). Это **не** лимит длительности загрузки: пока байты идут, соединение живёт. Обрывает сокеты «потерявших связь» телефонов |
| `ADMIN_PASSWORD` | `password` | Пароль админа при первом запуске |
| `UV_THREADPOOL_SIZE` | `4` | Размер libuv threadpool (fs.stat, crypto). Поднять до 8–16 на слабом хостинге для параллельного stat при листинге больших папок |

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
| `GET` | `/api/config` | Лимиты загрузки для клиента: `{"maxUploadBytes":104857600,"maxUploadMb":100,"maxFilesPerUpload":50}` |

### Files

| Метод | Endpoint | Параметры | Описание |
|--------|----------|-----------|----------|
| `GET` | `/api/files` | `?path=&page=&pageSize=&sort=&direction=` | Список файлов с пагинацией |
| `GET` | `/api/files/download` | `?path=` | Скачать файл (`Content-Disposition: attachment`) |
| `GET` | `/api/files/raw` | `?path=` | Отдать файл **inline** для превью (см. ниже) |
| `POST` | `/api/files/upload` | `?path=&overwrite=true` + `multipart: files` (поле `files`, до 50 файлов) | Загрузить небольшие файл(ы) одним запросом |
| `POST` | `/api/files/upload/start` | `{"path":"/","name":"video.mp4","size":629145600}` | Открыть (или вернуть существующую) сессию дозагрузки → `{uploadId, received, chunkBytes}` |
| `PUT` | `/api/files/upload/chunk` | `?id=&offset=` + тело `application/octet-stream` | Принять слайс; при несовпадении offset отдаёт `409 {received}` — откуда продолжать |
| `POST` | `/api/files/upload/finish` | `?id=` | Собрать файл в хранилище → `{files:[{status,name,path,size}]}` |
| `GET` | `/api/files/upload/status` | — | Незавершённые сессии пользователя (для баннера «продолжить загрузку») |
| `DELETE` | `/api/files/upload/session` | `?id=` | Отменить сессию и удалить принятые байты |
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
| 413 | `UPLOAD_TOO_LARGE` | Файл слишком большой (`MAX_UPLOAD_MB`) |
| 409 | `UPLOAD_OFFSET_MISMATCH` | Слайс прислан не с тем `offset` (ответ содержит актуальный `received`) |
| 409 | `UPLOAD_INCOMPLETE` | `finish` вызван до того, как принят весь файл |
| 404 | `UPLOAD_SESSION_NOT_FOUND` | Сессии нет, она истекла (24 ч) или принадлежит другому пользователю |
| 415 | `THUMBNAIL_UNAVAILABLE` | Картинку не удалось декодировать (битый файл, неподдерживаемый кодек) — клиент показывает иконку типа |
| 500 | `INTERNAL_ERROR` | Внутренняя ошибка |

Ошибки лимитов multipart (multer) отдаются с понятным текстом, а не как 500:

| HTTP | Код | Когда |
|------|-----|-------|
| 400 | `INVALID_REQUEST` | `Too many files in one upload (max 50)` — больше 50 файлов в одном запросе |
| 413 | `UPLOAD_TOO_LARGE` | `File is too large` — файл больше `MAX_UPLOAD_MB` |
| 400 | `INVALID_REQUEST` | Неизвестное поле формы, слишком длинные/частые поля |

Важно: лимит размера в multer срабатывает на уровне запроса, поэтому один большой файл в multipart-запросе прерывает **весь** запрос. Фронтенд это учитывает: файлы больше слайса идут через `/api/files/upload/start|chunk|finish`, мелкие — пачками по 4 файла (и не больше 16 МБ на запрос). При использовании API напрямую грузите большие файлы слайсами или проверяйте размер заранее (см. `/api/config`).

### Большие файлы (видео с телефона)

Файл больше `UPLOAD_CHUNK_MB` браузер режет на слайсы и шлёт их по одному:

1. `POST /api/files/upload/start` — сервер создаёт сессию в `CONFIG_DIR/uploads/<id>.part` и отвечает, сколько байт уже принято (0 для нового файла, больше нуля — если загрузку продолжают);
2. `PUT /api/files/upload/chunk?id=…&offset=…` — слайсы строго по порядку. Если `offset` не совпадает с тем, что реально лежит на диске, ответ `409 {received}` сообщает актуальную позицию, и клиент продолжает с неё;
3. `POST /api/files/upload/finish?id=…` — файл переносится в папку назначения (имя при коллизии получает ` (1)`).

Что это даёт:

- **обрыв связи не убивает загрузку** — повторяется только текущий слайс, а не 600 МБ целиком;
- **перезагрузка страницы/телефона не убивает загрузку** — принятые байты остаются на сервере (`GET /api/files/upload/status`), в интерфейсе появляется баннер «Продолжить», и после повторного выбора того же файла он догружается с места обрыва;
- **запросы короткие** — меньше шансов упереться в лимит размера тела запроса у reverse-proxy и в его таймауты, и каждый слайс заново проверяет, что соединение живо;
- **«зависшая» загрузка видна** — если 45 секунд нет прогресса (телефон потерял сеть, но TCP-соединение не закрылось), браузер сам прерывает слайс и повторяет его, вместо бесконечного «45%».

Если загрузка всё же рвётся, смотрите по порядку:

1. `MAX_UPLOAD_MB` в `.env` — файл больше лимита не примет даже `start` (клиент покажет «Too large … max N MB» ещё до отправки);
2. **reverse proxy перед приложением**: nginx `client_max_body_size` (слайс должен проходить: при `UPLOAD_CHUNK_MB=8` достаточно ~16 МБ) и `proxy_read_timeout`; Passenger/Apache — свои лимиты тела запроса;
3. **таймауты/зависания**: `REQUEST_TIMEOUT_MS` (по умолчанию 15 мин) — приложение выставляет `server.requestTimeout`, `server.timeout` и `headersTimeout` само; 45 секунд без прогресса на слайсе браузер обрывает и повторяет сам;
4. **iOS/iCloud**: если видео ещё не выгружено из iCloud, Safari отдаёт файл размером 0 байт — интерфейс скажет «Empty file — if it is stored in iCloud, download it in Photos first»;
5. свободное место в `STORAGE_DIR` и `CONFIG_DIR` (незавершённые сессии лежат в `CONFIG_DIR/uploads` и удаляются через 24 ч).

## Примеры curl

```sh
# Health check
curl http://localhost:3001/api/health

# Логин (сохраняет cookie в файл)
curl -c cookies.txt -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"password"}'

# Список файлов
curl -b cookies.txt 'http://localhost:3001/api/files?path=/&page=1&pageSize=50'

# Создать папку
curl -b cookies.txt -X POST http://localhost:3001/api/files/folder \
  -H 'Content-Type: application/json' \
  -d '{"path":"/","name":"docs"}'

# Загрузить один файл (поле формы называется files)
curl -b cookies.txt -X POST 'http://localhost:3001/api/files/upload?path=/docs' \
  -F 'files=@report.pdf'

# Загрузить несколько файлов одним запросом (до 50)
curl -b cookies.txt -X POST 'http://localhost:3001/api/files/upload?path=/docs' \
  -F 'files=@photo-1.jpg' -F 'files=@photo-2.jpg' -F 'files=@clip.mp4'

# Большой файл слайсами (размер берём из /api/config → uploadChunkBytes)
START=$(curl -s -b cookies.txt -X POST 'http://localhost:3001/api/files/upload/start' \
  -H 'Content-Type: application/json' \
  -d '{"path":"/videos","name":"clip.mp4","size":629145600}')
ID=$(echo "$START" | python3 -c 'import json,sys; print(json.load(sys.stdin)["uploadId"])')
split -b 8388608 clip.mp4 slice_
OFFSET=0
for f in slice_*; do
  curl -s -b cookies.txt -X PUT \
    "http://localhost:3001/api/files/upload/chunk?id=$ID&offset=$OFFSET" \
    -H 'Content-Type: application/octet-stream' --data-binary "@$f"
  OFFSET=$((OFFSET + $(stat -c%s "$f")))
done
curl -s -b cookies.txt -X POST "http://localhost:3001/api/files/upload/finish?id=$ID"

# Если загрузка прервалась — узнать, сколько уже принято:
curl -s -b cookies.txt 'http://localhost:3001/api/files/upload/status'

# Скачать файл
curl -b cookies.txt 'http://localhost:3001/api/files/download?path=/docs/report.pdf' \
  -o report.pdf

# Опубликовать файл (получить публичную ссылку)
curl -b cookies.txt -X POST http://localhost:3001/api/files/publish \
  -H 'Content-Type: application/json' \
  -d '{"path":"/docs/report.pdf"}'

# Скачать по публичной ссылке (без авторизации)
curl http://localhost:3001/pub/docs/report.pdf

# Отозвать публичный доступ
curl -b cookies.txt -X DELETE http://localhost:3001/api/files/publish \
  -H 'Content-Type: application/json' \
  -d '{"path":"/docs/report.pdf"}'

# Переименовать
curl -b cookies.txt -X PATCH http://localhost:3001/api/files/rename \
  -H 'Content-Type: application/json' \
  -d '{"path":"/docs/report.pdf","newName":"final.pdf"}'

# Удалить
curl -b cookies.txt -X DELETE 'http://localhost:3001/api/files?path=/docs/final.pdf'

# Выйти
curl -b cookies.txt -X POST http://localhost:3001/api/auth/logout
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
│       ├── errors.js       # ApiError + error handler + коды multer
│       ├── limits.js       # MAX_FILES_PER_UPLOAD (общий для сервера и ошибок)
│       └── asyncRoute.js   # Обёртка для async-обработчиков
├── scripts/
│   └── create-admin.js     # CLI создание пользователя
└── test/
    └── integration.js      # Интеграционные тесты (78 шт.)
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
- Upload ограничен по размеру (`MAX_UPLOAD_MB`) и по количеству файлов в запросе (50)
- Превью-роут `/api/files/raw` не отдаёт inline потенциально активные типы (svg, html) и всегда ставит `nosniff` + CSP `sandbox`
- Имя файла из multipart перекодируется из latin1 в UTF-8, поэтому кириллица и эмодзи в именах не превращаются в мусор
- Нельзя удалить или переименовать корень хранилища
- Ошибки не раскрывают абсолютные пути сервера
- JSON-конфиги записываются атомарно (tmp -> rename)
- Сессии очищаются от просроченных при старте
- Публичные ссылки: случайный токен (24 hex), недоступны без явной публикации

## Frontend

Ванильные HTML/CSS/JS без сборки: `public/index.html`, `public/app.css`, `public/app.js`. Дизайн-система описана в `DESIGN.md`.

Мобильная адаптация (mobile-first, применяется на ширине ≤ 640px, тач-размеры также включаются по `pointer: coarse`):

- компактный sticky-хедер: строка навигации (вверх + хлебные крошки + сортировка) и тулбар с иконками;
- таблица файлов превращается в список с крупными строками (имя + размер/дата), все действия — в bottom sheet по кнопке «⋮» (44×44);
- загрузка: выбор «Файлы / Фото и видео / Камера» (нативные `<input type=file>` + `capture=environment`), прогресс по каждому файлу, отмена/повтор/сворачивание панели, предупреждение при попытке уйти во время загрузки;
- большие файлы (> `UPLOAD_CHUNK_MB`) грузятся слайсами с автоповтором и дозагрузкой с позиции сервера: обрыв связи или перезагрузка страницы не теряют уже принятые байты, панель загрузки остаётся открытой с кнопкой «Continue», а после перезагрузки появляется баннер «Interrupted upload — выберите тот же файл»;
- превью открывается в полноэкранном просмотрщике (свайпы, `Escape`, кнопка «Назад» на Android закрывает просмотрщик, а не страницу) — через `/api/files/raw` с поддержкой `Range` для видео;
- выделение файлов и пакетное удаление, панель пакетных действий закреплена снизу и не перекрывает контент;
- все модальные окна — bottom sheet на телефоне и центрированные попапы на десктопе; фокус удерживается внутри окна, фон помечается `aria-hidden`;
- учтены `env(safe-area-inset-*)`, `viewport-fit=cover`, шрифт полей 16px (iOS не зумит при фокусе), `@media (hover: hover)` для hover-эффектов;
- контраст текста соответствует WCAG AA (все проверенные элементы ≥ 4.5:1), есть видимый `:focus-visible`.

## Ограничения

- Один процесс Node.js (нет поддержки кластеризации)
- Без внешней БД — пользователи и сессии в JSON-файлах
- Нет WebSocket/real-time обновлений
- Symlink не обрабатываются (MVP)
