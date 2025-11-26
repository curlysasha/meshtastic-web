from fastapi import WebSocket
from typing import Dict, Any, Set
import json
import asyncio
import logging

logger = logging.getLogger(__name__)


class WebSocketManager:
    def __init__(self):
        self.connections: list[WebSocket] = []
        self._loop: asyncio.AbstractEventLoop | None = None
        self._pending_futures: Set[asyncio.Future] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.connections:
            self.connections.remove(websocket)

    async def broadcast(self, message: Dict[str, Any]):
        data = json.dumps(message, default=str)
        disconnected = []
        for conn in self.connections:
            try:
                await conn.send_text(data)
            except Exception:
                disconnected.append(conn)
        for conn in disconnected:
            self.disconnect(conn)

    def broadcast_sync(self, message: Dict[str, Any]):
        """Sync wrapper for use in meshtastic callbacks"""
        if self._loop and self._loop.is_running():
            future = asyncio.run_coroutine_threadsafe(self.broadcast(message), self._loop)
            self._pending_futures.add(future)
            future.add_done_callback(lambda f: self._pending_futures.discard(f))

    def set_loop(self, loop: asyncio.AbstractEventLoop):
        self._loop = loop

    async def cleanup(self):
        """Cancel pending futures on shutdown"""
        for future in self._pending_futures:
            future.cancel()
        self._pending_futures.clear()


ws_manager = WebSocketManager()
