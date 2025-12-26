import asyncio
import logging
import json
import sys
import os
import webbrowser
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from schemas import ConnectRequest, MessageRequest, TracerouteRequest, ConnectionStatus
from meshtastic_manager import mesh_manager
from websocket_manager import ws_manager
import database as db

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Enable DEBUG logging for meshtastic library to see BLE connection details
logging.getLogger("meshtastic").setLevel(logging.DEBUG)

# Определяем базовую директорию и путь к статике
if getattr(sys, "frozen", False):
    # Запущено как exe
    # sys._MEIPASS - это временная папка, куда PyInstaller распаковывает ресурсы
    BUNDLE_DIR = Path(getattr(sys, "_MEIPASS", sys.executable))

    # Сначала проверяем внешнюю папку static (рядом с exe)
    # Это позволяет пользователю «подменить» интерфейс без пересборки
    EXTERNAL_STATIC = Path(sys.executable).parent / "static"
    if EXTERNAL_STATIC.exists():
        STATIC_DIR = EXTERNAL_STATIC
    else:
        # Если внешней нет, используем упакованную внутри
        STATIC_DIR = BUNDLE_DIR / "static"
else:
    # Запущено как скрипт
    STATIC_DIR = Path(__file__).parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.init_db()
    loop = asyncio.get_event_loop()
    ws_manager.set_loop(loop)
    mesh_manager.set_loop(loop)

    # Auto-reconnect from saved settings
    last_type = await db.get_setting("last_connection_type")
    last_address = await db.get_setting("last_address")
    if last_type and last_address:
        try:
            if last_type == "serial":
                mesh_manager.connect_serial(last_address)
            elif last_type == "tcp":
                parts = last_address.split(":")
                host = parts[0]
                port = int(parts[1]) if len(parts) > 1 else 4403
                mesh_manager.connect_tcp(host, port)
            logger.info(f"Auto-reconnected to {last_type}://{last_address}")
        except Exception as e:
            logger.warning(f"Auto-reconnect failed: {e}")

    yield

    mesh_manager.disconnect()
    await ws_manager.cleanup()
    await db.close_db()


app = FastAPI(title="MeshRadar", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:8000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:8000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        await websocket.send_json(
            {"type": "connection_status", "data": mesh_manager.get_status()}
        )

        while True:
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=30)
            except asyncio.TimeoutError:
                await websocket.send_json({"type": "ping"})
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception:
        ws_manager.disconnect(websocket)


@app.post("/api/connect")
async def connect(request: ConnectRequest):
    success = False
    error_detail = "Connection failed"

    if request.type == "serial":
        success = mesh_manager.connect_serial(request.address)
    elif request.type == "tcp":
        parts = request.address.split(":")
        host = parts[0]
        try:
            port = int(parts[1]) if len(parts) > 1 else 4403
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid port number")
        success = mesh_manager.connect_tcp(host, port)
    elif request.type == "ble":
        success = mesh_manager.connect_ble(request.address)
        if success:
            connected = await mesh_manager.wait_for_connection(timeout=120)
            if connected:
                success = True
            else:
                success = False
                mesh_manager.disconnect()
                error_detail = mesh_manager.get_connect_error() or "BLE connection timeout"

    if success:
        await db.save_setting("last_connection_type", request.type)
        await db.save_setting("last_address", request.address)
        return {"success": True, "status": mesh_manager.get_status()}

    raise HTTPException(status_code=400, detail=error_detail)


@app.post("/api/disconnect")
async def disconnect():
    mesh_manager.disconnect()
    return {"success": True}


@app.get("/api/ble-scan")
async def scan_ble_devices():
    """Scan for available BLE Meshtastic devices."""
    devices = mesh_manager.scan_ble_devices()
    return {"devices": devices}


@app.get("/api/status", response_model=ConnectionStatus)
async def get_status():
    status = mesh_manager.get_status()
    return ConnectionStatus(
        connected=status.get("connected", False),
        connection_type=status.get("connection_type"),
        address=status.get("address"),
        my_node_id=status.get("my_node_id"),
        my_node_num=status.get("my_node_num"),
    )


@app.get("/api/nodes")
async def get_nodes():
    if not mesh_manager.connected:
        raise HTTPException(status_code=400, detail="Not connected")
    return mesh_manager.get_nodes()


@app.get("/api/node/{node_id}")
async def get_node(node_id: str):
    if not mesh_manager.connected:
        raise HTTPException(status_code=400, detail="Not connected")
    node = mesh_manager.get_node(node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    return node


@app.get("/api/channels")
async def get_channels():
    if not mesh_manager.connected:
        raise HTTPException(status_code=400, detail="Not connected")
    return mesh_manager.get_channels()


@app.get("/api/config")
async def get_config():
    if not mesh_manager.connected:
        raise HTTPException(status_code=400, detail="Not connected")
    return mesh_manager.get_config()


@app.post("/api/message")
async def send_message(request: MessageRequest):
    if not mesh_manager.connected:
        raise HTTPException(status_code=400, detail="Not connected")

    packet_id = mesh_manager.send_message(
        text=request.text,
        destination_id=request.destination_id,
        channel_index=request.channel_index,
        reply_id=request.reply_id,
    )

    if packet_id is None:
        raise HTTPException(status_code=500, detail="Failed to send message")

    return {"success": True, "packet_id": packet_id}


@app.post("/api/traceroute/{node_id}")
async def traceroute(node_id: str, request: TracerouteRequest = TracerouteRequest()):
    if not mesh_manager.connected:
        raise HTTPException(status_code=400, detail="Not connected")

    logger.info(f"Traceroute request for {node_id}")

    success = mesh_manager.send_traceroute(
        node_id,
        request.hop_limit,
        request.channel_index,
    )

    if not success:
        raise HTTPException(status_code=500, detail="Failed to send traceroute")

    return {"success": True, "message": "Traceroute initiated"}


@app.post("/api/node/{node_id}/favorite")
async def set_favorite(node_id: str, is_favorite: bool = Query(...)):
    """Set favorite status for a node."""
    if not mesh_manager.connected:
        raise HTTPException(status_code=400, detail="Not connected")

    success = mesh_manager.set_favorite(node_id, is_favorite)

    if not success:
        raise HTTPException(status_code=500, detail="Failed to set favorite")

    return {"success": True, "node_id": node_id, "is_favorite": is_favorite}


@app.get("/api/messages")
async def get_messages(channel: int = None, dm_partner: str = None, limit: int = 100):
    my_node_id = mesh_manager.my_node_id
    messages = await db.get_messages(
        channel=channel, dm_partner=dm_partner, my_node_id=my_node_id, limit=limit
    )
    return messages


# Монтируем статические файлы (React build)
if STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    @app.get("/")
    async def serve_index():
        return FileResponse(STATIC_DIR / "index.html")

    @app.get("/{path:path}")
    async def serve_spa(path: str):
        # Для SPA: если файл существует - отдаём его, иначе index.html
        file_path = STATIC_DIR / path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(STATIC_DIR / "index.html")


if __name__ == "__main__":
    import uvicorn

    port = 8000

    # В портативном режиме открываем браузер
    if getattr(sys, "frozen", False):
        webbrowser.open(f"http://localhost:{port}")

    uvicorn.run(app, host="0.0.0.0", port=port)
