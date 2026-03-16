# Local Server Gateway

Gateway для связи локальных устройств в единую очередь задач. Устройства подключаются по WebSocket, подписываются на нужные типы задач и получают их в реальном времени. Задачи добавляются через HTTP API.

**Стек:** Node.js, Express, Socket.io, Redis, Docker

---

## Структура проекта

```
src/
├── index.js          # Entrypoint
├── config.js         # Конфиг из env
├── redis.js          # Redis клиент + атомарный claim (Lua)
├── routes/
│   ├── tasks.js      # POST/GET /tasks
│   └── files.js      # GET /files/:filename
└── socket/
    └── index.js      # Socket.io обработчики
```

---

## HTTP API

### `POST /tasks` — создать задачу

Принимает `multipart/form-data`:

| Поле | Тип | Обязательное | Описание |
|------|-----|:---:|---------|
| `type` | string | ✓ | Тип задачи для фильтрации обработчиков |
| `content` | string / JSON | — | Произвольные данные задачи |
| `files` | file[] | — | Прикреплённые файлы |

```bash
# Без файлов
curl -X POST http://localhost:3000/tasks \
  -F type=photo \
  -F 'content={"source":"iphone"}'

# С файлом
curl -X POST http://localhost:3000/tasks \
  -F type=photo \
  -F 'content={"album":"vacation"}' \
  -F files=@/path/to/photo.jpg
```

### `GET /tasks` — список всех задач

```bash
curl http://localhost:3000/tasks
```

### `GET /tasks/:id` — одна задача

```bash
curl http://localhost:3000/tasks/<id>
```

### `GET /files/:filename` — скачать файл

```bash
curl http://localhost:3000/files/<filename> -o output.jpg
```

### `GET /health` — healthcheck

```bash
curl http://localhost:3000/health
# {"status":"ok"}
```

---

## Структура задачи

```json
{
  "id": "uuid",
  "type": "photo",
  "content": { "album": "vacation" },
  "files": [
    {
      "filename": "uuid.jpg",
      "originalname": "photo.jpg",
      "mimetype": "image/jpeg",
      "size": 204800
    }
  ],
  "provider": null,
  "status": "waiting",
  "date": "2024-01-01T00:00:00.000Z"
}
```

**Статусы:** `waiting` → `in_progress` → `failed` (или удаление при успехе)

---

## Socket.io API

Подключение: `ws://localhost:3000`

### События: Client → Server

#### `subscribe`
Подписаться на типы задач. Сервер сразу отдаёт все `waiting` задачи для этих типов.
```json
{ "types": ["photo", "document"] }
```

#### `task:claim`
Атомарно забронировать задачу за собой.
```json
{ "taskId": "uuid" }
```
Ack: `{ "success": true, "task": {...} }` или `{ "success": false, "error": "..." }`

#### `task:complete`
Завершить задачу — удаляется из очереди.
```json
{ "taskId": "uuid" }
```

#### `task:fail`
Пометить задачу как проваленную.
```json
{ "taskId": "uuid", "reason": "описание ошибки" }
```

### События: Server → Client

#### `task:new`
Новая задача появилась в очереди (пуш в реальном времени).
```json
{ "id": "uuid", "type": "photo", "content": {...}, ... }
```

### Пример обработчика (Node.js)

```js
const { io } = require('socket.io-client');

const socket = io('http://localhost:3000');

socket.on('connect', () => {
  socket.emit('subscribe', { types: ['photo'] });
});

socket.on('task:new', (task) => {
  socket.emit('task:claim', { taskId: task.id }, async ({ success, task: claimed }) => {
    if (!success) return;

    try {
      await processTask(claimed);
      socket.emit('task:complete', { taskId: claimed.id }, () => {});
    } catch (err) {
      socket.emit('task:fail', { taskId: claimed.id, reason: err.message }, () => {});
    }
  });
});
```

---

## Деплой

### Требования к серверу
- Docker + Docker Compose
- 512 MB RAM минимум
- Открытый порт 3000

### 1. Установить Docker на сервере

```bash
ssh root@<IP_СЕРВЕРА>
curl -fsSL https://get.docker.com | sh
```

### 2. Загрузить проект

**Через git:**
```bash
git clone <REPO_URL> /opt/gateway
cd /opt/gateway
```

**Через scp (с локальной машины):**
```bash
scp -r /path/to/LOCAL_SERVER root@<IP>:/opt/gateway
```

### 3. Запустить

```bash
cd /opt/gateway
docker compose up -d --build
```

### 4. Проверить

```bash
docker compose ps
curl http://localhost:3000/health
```

### 5. Открыть порт

```bash
ufw allow 3000/tcp
ufw enable
```

### Полезные команды

```bash
# Логи
docker compose logs -f gateway

# Перезапуск после изменений
docker compose up -d --build

# Остановить
docker compose down

# Остановить и удалить данные Redis
docker compose down -v
```

### Память (под сервер 512 MB)

| Сервис | Лимит |
|--------|-------|
| gateway (Node.js) | 200 MB |
| redis | 80 MB |
| ОС | ~150 MB |

---

## Swagger

Документация API доступна по адресу: `http://localhost:3000/api-docs`
