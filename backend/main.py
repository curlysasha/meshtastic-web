import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from schemas import ConnectRequest, MessageRequest, TracerouteRequest, ConnectionStatus
from meshtastic_manager import mesh_manager
from websocket_manager import ws_manager
import database as db

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


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


app = FastAPI(title="Meshtastic Web Interface", lifespan=lifespan)

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
        await websocket.send_json({
            "type": "connection_status",
            "data": mesh_manager.get_status()
        })

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

    if success:
        await db.save_setting("last_connection_type", request.type)
        await db.save_setting("last_address", request.address)
        return {"success": True, "status": mesh_manager.get_status()}

    raise HTTPException(status_code=400, detail="Connection failed")


@app.post("/api/disconnect")
async def disconnect():
    mesh_manager.disconnect()
    return {"success": True}


@app.get("/api/status", response_model=ConnectionStatus)
async def get_status():
    status = mesh_manager.get_status()
    return ConnectionStatus(
        connected=status.get("connected", False),
        connection_type=status.get("connection_type"),
        address=status.get("address"),
        my_node_id=status.get("my_node_id"),
        my_node_num=status.get("my_node_num")
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
        channel_index=request.channel_index
    )

    if packet_id is None:
        raise HTTPException(status_code=500, detail="Failed to send message")

    return {"success": True, "packet_id": packet_id}


@app.post("/api/traceroute/{node_id}")
async def traceroute(node_id: str, request: TracerouteRequest = TracerouteRequest()):
    if not mesh_manager.connected:
        raise HTTPException(status_code=400, detail="Not connected")

    logger.info(f"Traceroute request received for {node_id}")

    success = mesh_manager.send_traceroute(
        dest=node_id,
        hop_limit=request.hop_limit,
        channel_index=request.channel_index
    )

    if not success:
        raise HTTPException(status_code=500, detail="Failed to send traceroute")

    logger.info(f"Traceroute request sent, waiting for response via WebSocket")
    return {"success": True, "message": "Traceroute initiated"}


@app.get("/api/messages")
async def get_messages(channel: int = None, dm_partner: str = None, limit: int = 100):
    my_node_id = mesh_manager.my_node_id
    messages = await db.get_messages(
        channel=channel,
        dm_partner=dm_partner,
        my_node_id=my_node_id,
        limit=limit
    )
    return messages


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
