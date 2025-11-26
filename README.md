# Meshtastic Web Interface

Современный веб-интерфейс для управления Meshtastic mesh-сетью. Поддерживает подключение по Serial и TCP.

![Dark Mode UI](https://img.shields.io/badge/UI-Dark%20Mode-1a1a2e)
![Python](https://img.shields.io/badge/Backend-Python%203.10+-3776ab)
![React](https://img.shields.io/badge/Frontend-React%2018-61dafb)

## Возможности

- **Подключение** — Serial (USB) и TCP (WiFi) к Meshtastic нодам
- **Чат** — каналы и личные сообщения с подтверждением доставки (✓ ✓✓)
- **Список нод** — все ноды в mesh с телеметрией (батарея, SNR, позиция)
- **Traceroute** — визуализация маршрута до ноды
- **История** — сообщения сохраняются в SQLite
- **Real-time** — WebSocket для мгновенных обновлений
- **Уведомления** — звук при новых сообщениях

## Быстрый старт

### Требования

- Python 3.10+
- Node.js 18+
- Meshtastic нода (опционально для тестирования UI)

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

Backend запустится на http://localhost:8000

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend запустится на http://localhost:5173

## API

### REST Endpoints

| Method | Endpoint | Описание |
|--------|----------|----------|
| POST | `/api/connect` | Подключение к ноде |
| POST | `/api/disconnect` | Отключение |
| GET | `/api/status` | Статус подключения |
| GET | `/api/nodes` | Список нод |
| GET | `/api/node/{id}` | Информация о ноде |
| GET | `/api/channels` | Список каналов |
| GET | `/api/config` | Конфигурация ноды |
| POST | `/api/message` | Отправить сообщение |
| POST | `/api/traceroute/{id}` | Traceroute до ноды |
| GET | `/api/messages` | История сообщений |

### WebSocket Events

```typescript
// Подключение
ws://localhost:8000/ws

// События (server → client)
{ type: "connection_status", data: { connected: boolean, ... } }
{ type: "message", data: { sender, text, channel, ... } }
{ type: "ack", data: { packet_id, status: "ack"|"nak" } }
{ type: "node_update", data: { id, user, position, ... } }
{ type: "traceroute", data: { route: [...], snr_towards: [...] } }
{ type: "position", data: { from, latitude, longitude } }
{ type: "telemetry", data: { from, device_metrics } }
```

### Примеры

**Подключение по TCP:**
```bash
curl -X POST http://localhost:8000/api/connect \
  -H "Content-Type: application/json" \
  -d '{"type": "tcp", "address": "192.168.1.100:4403"}'
```

**Подключение по Serial:**
```bash
curl -X POST http://localhost:8000/api/connect \
  -H "Content-Type: application/json" \
  -d '{"type": "serial", "address": "/dev/ttyUSB0"}'
```

**Отправка сообщения:**
```bash
curl -X POST http://localhost:8000/api/message \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello mesh!", "channel_index": 0}'
```

## Структура проекта

```
meshtastic/
├── backend/
│   ├── main.py              # FastAPI приложение
│   ├── meshtastic_manager.py # Управление подключением
│   ├── websocket_manager.py  # WebSocket broadcast
│   ├── database.py          # SQLite операции
│   ├── schemas.py           # Pydantic модели
│   └── requirements.txt
│
└── frontend/
    ├── src/
    │   ├── components/      # React компоненты
    │   │   ├── Sidebar.tsx
    │   │   ├── ChatArea.tsx
    │   │   ├── MessageBubble.tsx
    │   │   ├── NodeInfoPanel.tsx
    │   │   └── ConnectionPanel.tsx
    │   ├── hooks/           # React hooks
    │   │   ├── useWebSocket.ts
    │   │   └── useApi.ts
    │   ├── store/           # Zustand state
    │   └── types/           # TypeScript типы
    ├── package.json
    └── vite.config.ts
```

## Технологии

**Backend:**
- FastAPI — async web framework
- meshtastic — Python библиотека для Meshtastic
- aiosqlite — async SQLite
- websockets — real-time коммуникация

**Frontend:**
- React 18 + TypeScript
- Tailwind CSS — стилизация
- Zustand — state management
- React Query — data fetching
- Radix UI — accessible компоненты

## Разработка

```bash
# Backend с hot-reload
cd backend && uvicorn main:app --reload

# Frontend с hot-reload
cd frontend && npm run dev

# Build frontend для production
cd frontend && npm run build
```

## License

MIT
