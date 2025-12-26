import asyncio
import logging
import time
from typing import Optional, Dict, Any, Set, List
from concurrent.futures import Future
from pubsub import pub
import meshtastic
import meshtastic.serial_interface
import meshtastic.tcp_interface
import meshtastic.ble_interface
from google.protobuf.json_format import MessageToDict

from websocket_manager import ws_manager
import database as db

logger = logging.getLogger(__name__)


class MeshtasticManager:
    def __init__(self):
        self.interface: Optional[meshtastic.mesh_interface.MeshInterface] = None
        self.connection_type: Optional[str] = None
        self.address: Optional[str] = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._pending_tasks: Set[Future] = set()
        self._ble_devices_cache: Dict[str, Any] = {}  # Cache BLEDevice objects from scan
        self._connect_error: Optional[str] = None
        self._connect_event: Optional[asyncio.Event] = None
        self._connect_thread: Optional["threading.Thread"] = None

    def set_loop(self, loop: asyncio.AbstractEventLoop):
        self._loop = loop

    def _run_async(self, coro):
        """Safely schedule coroutine from sync callback"""
        if self._loop and self._loop.is_running():
            future = asyncio.run_coroutine_threadsafe(coro, self._loop)
            self._pending_tasks.add(future)
            future.add_done_callback(lambda f: self._pending_tasks.discard(f))

    @property
    def connected(self) -> bool:
        return self.interface is not None

    @property
    def my_node_id(self) -> Optional[str]:
        if self.interface and self.interface.myInfo:
            return f"!{self.interface.myInfo.my_node_num:08x}"
        return None

    @property
    def my_node_num(self) -> Optional[int]:
        if self.interface and self.interface.myInfo:
            return self.interface.myInfo.my_node_num
        return None

    def connect_serial(self, dev_path: str) -> bool:
        self.disconnect()
        # Subscribe before opening interface to catch queued messages delivered immediately on connect
        self._setup_callbacks()
        try:
            self.interface = meshtastic.serial_interface.SerialInterface(devPath=dev_path)
            self.connection_type = "serial"
            self.address = dev_path
            return True
        except Exception as e:
            logger.error(f"Serial connection error: {e}")
            self._unsubscribe_all()
            self.interface = None
            return False

    def connect_tcp(self, hostname: str, port: int = 4403) -> bool:
        self.disconnect()
        # Subscribe before opening interface to catch queued messages delivered immediately on connect
        self._setup_callbacks()
        try:
            self.interface = meshtastic.tcp_interface.TCPInterface(hostname=hostname, portNumber=port)
            self.connection_type = "tcp"
            self.address = f"{hostname}:{port}"
            return True
        except Exception as e:
            logger.error(f"TCP connection error: {e}")
            self._unsubscribe_all()
            self.interface = None
            return False

    def scan_ble_devices(self) -> List[Dict[str, str]]:
        """Scan for available BLE Meshtastic devices.

        Returns:
            List of dicts with 'name' and 'address' keys
        """
        try:
            logger.info("Scanning for BLE devices (takes 10 seconds)...")
            # Use standard meshtastic scan - finds both advertising and paired devices
            devices = meshtastic.ble_interface.BLEInterface.scan()

            # Clear old cache and store fresh BLEDevice objects
            self._ble_devices_cache.clear()

            results = []
            for device in devices:
                # Cache the BLEDevice object for later use
                self._ble_devices_cache[device.address] = device

                results.append({
                    "name": device.name or f"Unknown ({device.address})",
                    "address": device.address
                })

            logger.info(f"Found {len(results)} BLE device(s)")
            return results
        except Exception as e:
            logger.error(f"BLE scan error: {e}")
            return []

    def connect_ble(self, address: str) -> bool:
        """Connect to a Meshtastic device via BLE.

        Note: BLE library always does a 10-second scan before connecting,
        even when address is known (recommended by Bleak docs).
        This is run in a separate thread to avoid blocking.

        Args:
            address: BLE device address (MAC address like F4:12:FA:D0:45:AB)

        Returns:
            True if connection initiated (actual connection happens async)
        """
        self.disconnect()
        # Subscribe before opening interface to catch queued messages delivered immediately on connect
        self._setup_callbacks()
        self._connect_error = None
        # Event is used to signal wait_for_connection from the connect thread
        try:
            if self._loop:
                self._connect_event = asyncio.Event()
        except Exception:
            self._connect_event = None

        # Notify that connection is starting
        ws_manager.broadcast_sync({
            "type": "connection_status",
            "data": {"connected": False, "connecting": True, "message": "BLE connecting (scanning...)"}
        })

        def _connect_thread():
            try:
                # Check if we have a cached BLEDevice from recent scan
                cached_device = self._ble_devices_cache.get(address)

                if cached_device:
                    logger.info(f"BLE connecting to {address} using cached device...")

                    # Simple monkey-patch to avoid re-scanning
                    original_find_device = meshtastic.ble_interface.BLEInterface.find_device
                    # Preserve the original signature to avoid TypeError when the library
                    # passes extra kwargs like timeout/exit_on_error
                    def _use_cached_device(self, addr=None, *args, **kwargs):
                        return cached_device

                    meshtastic.ble_interface.BLEInterface.find_device = _use_cached_device

                    try:
                        import sys
                        self.interface = meshtastic.ble_interface.BLEInterface(
                            address=address,
                            noNodes=True,  # Skip NodeDB download for faster connection
                            timeout=120,
                            debugOut=sys.stderr
                        )
                        logger.info("BLE connected successfully")
                    finally:
                        meshtastic.ble_interface.BLEInterface.find_device = original_find_device
                else:
                    logger.info(f"BLE connecting to {address} (includes 10s scan)...")
                    import sys
                    self.interface = meshtastic.ble_interface.BLEInterface(
                        address=address,
                        noNodes=True,  # Skip NodeDB download
                        timeout=120,
                        debugOut=sys.stderr
                    )
                    logger.info("BLE connected successfully")

                # Follow library docs: wait for full connection, then config
                try:
                    wait_for_connected = getattr(self.interface, "waitForConnected", None)
                    if callable(wait_for_connected):
                        wait_for_connected(timeout=60)
                except Exception as conn_err:
                    raise RuntimeError(f"BLE waitForConnected failed: {conn_err}") from conn_err

                try:
                    wait_for_config = getattr(self.interface, "waitForConfig", None)
                    if callable(wait_for_config):
                        wait_for_config(timeout=30)
                except Exception as config_err:
                    logger.debug(f"BLE waitForConfig failed/ignored: {config_err}")

                self.connection_type = "ble"
                self.address = address
                logger.info(f"Connected via BLE: {address}")

                # Proactively notify clients in case the library event does not fire
                ws_manager.broadcast_sync({
                    "type": "connection_status",
                    "data": {"connected": True, "type": self.connection_type, "address": self.address}
                })
                if self._connect_event and self._loop:
                    self._loop.call_soon_threadsafe(self._connect_event.set)
                # Successful connection notification will be sent by _on_connection callback
            except BaseException as e:
                self._connect_error = str(e)
                logger.error(f"BLE connection error: {e}")
                self._unsubscribe_all()
                self.interface = None
                # Notify about failed connection
                ws_manager.broadcast_sync({
                    "type": "connection_status",
                    "data": {"connected": False, "connecting": False, "error": str(e)}
                })
                if self._connect_event and self._loop:
                    self._loop.call_soon_threadsafe(self._connect_event.set)

        # Start connection in separate thread to avoid blocking FastAPI
        import threading
        self._connect_thread = threading.Thread(target=_connect_thread, daemon=True, name="meshtastic-ble-connect")
        self._connect_thread.start()

        # Return True immediately - connection happens in background
        return True

    async def wait_for_connection(self, timeout: float = 60.0) -> bool:
        """Await until interface is ready or timeout expires."""
        # Prefer event signaling from the connect thread
        if self._connect_event:
            try:
                await asyncio.wait_for(self._connect_event.wait(), timeout=timeout)
            except asyncio.TimeoutError:
                logger.warning("BLE wait_for_connection timed out waiting for connect thread")
                return False
            if self._connect_error:
                return False
            return self.connected

        # Fallback polling if event not available
        end_time = time.monotonic() + timeout
        while time.monotonic() < end_time:
            if self.connected:
                return True
            if self._connect_error:
                return False
            await asyncio.sleep(0.25)
        logger.warning("BLE wait_for_connection timeout (polling)")
        return False

    def get_connect_error(self) -> Optional[str]:
        return self._connect_error

    def disconnect(self):
        if self.interface:
            # Unsubscribe first to prevent reconnection attempts
            self._unsubscribe_all()
            try:
                self.interface.close()
            except Exception:
                pass
            self.interface = None
            self.connection_type = None
            self.address = None

    def _setup_callbacks(self):
        pub.subscribe(self._on_receive, "meshtastic.receive")
        pub.subscribe(self._on_connection, "meshtastic.connection.established")
        pub.subscribe(self._on_connection_lost, "meshtastic.connection.lost")
        pub.subscribe(self._on_node_updated, "meshtastic.node.updated")

    def _unsubscribe_all(self):
        topics = [
            ("meshtastic.receive", self._on_receive),
            ("meshtastic.connection.established", self._on_connection),
            ("meshtastic.connection.lost", self._on_connection_lost),
            ("meshtastic.node.updated", self._on_node_updated),
        ]
        for topic, handler in topics:
            try:
                pub.unsubscribe(handler, topic)
            except Exception as e:
                logger.debug(f"Unsubscribe {topic}: {e}")

    def _on_receive(self, packet, interface):
        decoded = packet.get("decoded", {})
        portnum = decoded.get("portnum")

        if portnum == "ROUTING_APP":
            self._handle_routing(packet)
        elif portnum == "TRACEROUTE_APP":
            self._handle_traceroute_response(packet)
        elif portnum == "TEXT_MESSAGE_APP":
            self._handle_text_message(packet)
        elif portnum == "POSITION_APP":
            self._handle_position(packet)
        elif portnum == "TELEMETRY_APP":
            self._handle_telemetry(packet)

    def _handle_routing(self, packet):
        request_id = packet.get("decoded", {}).get("requestId")
        if not request_id:
            return

        routing = packet.get("decoded", {}).get("routing", {})
        error_reason = routing.get("errorReason", "NONE")
        ack_status = "ack" if error_reason == "NONE" else "nak"

        self._run_async(db.update_message_ack(request_id, ack_status))

        ws_manager.broadcast_sync({
            "type": "ack",
            "data": {
                "packet_id": request_id,
                "status": ack_status,
                "error": error_reason if error_reason != "NONE" else None
            }
        })

    def _handle_traceroute_response(self, packet):
        decoded = packet.get("decoded", {})
        request_id = decoded.get("requestId")
        traceroute_data = decoded.get("traceroute", {})

        # Convert protobuf traceroute data to dict if needed
        if hasattr(traceroute_data, 'DESCRIPTOR'):
            traceroute_data = MessageToDict(traceroute_data)

        # Extract route data
        # According to protobuf: "route" contains intermediate hops (nodes visited on the way)
        # Source and destination are NOT included in the route array
        route = traceroute_data.get("route", [])
        route_back = traceroute_data.get("routeBack", [])
        snr_towards = traceroute_data.get("snrTowards", [])
        snr_back = traceroute_data.get("snrBack", [])

        # Filter out invalid node IDs (0xFFFFFFFF = 4294967295 = unknown/encrypted nodes)
        if isinstance(route, list):
            route = [node for node in route if node != 4294967295 and node != 0]
        if isinstance(route_back, list):
            route_back = [node for node in route_back if node != 4294967295 and node != 0]

        logger.info(f"Traceroute response: from={packet.get('fromId')}, hops_forward={len(route)}, hops_back={len(route_back)}, route={route}, route_back={route_back}")

        ws_manager.broadcast_sync({
            "type": "traceroute",
            "data": {
                "request_id": request_id,
                "from": packet.get("fromId"),
                "route": route,
                "route_back": route_back,
                "snr_towards": snr_towards if isinstance(snr_towards, list) else [],
                "snr_back": snr_back if isinstance(snr_back, list) else []
            }
        })

    def _handle_text_message(self, packet):
        decoded = packet.get("decoded", {})
        text = decoded.get("text", "")
        sender = packet.get("fromId", "unknown")
        receiver = packet.get("toId")
        channel = packet.get("channel", 0)
        packet_id = packet.get("id")

        # Robust reply_id extraction (can be in decoded or packet, as replyId or reply_id or replyTo)
        reply_id = decoded.get("replyId") or decoded.get("reply_id") or decoded.get("replyTo")
        if reply_id is None:
            reply_id = packet.get("replyId") or packet.get("reply_id") or packet.get("replyTo")

        logger.info(f"Received message: id={packet_id}, sender={sender}, text={text[:20]}..., reply_id={reply_id}")

        self._run_async(db.save_message(
            packet_id=packet_id,
            sender=sender,
            receiver=receiver if receiver != "^all" else None,
            channel=channel,
            text=text,
            is_outgoing=False,
            ack_status="received",
            reply_id=reply_id
        ))

        ws_manager.broadcast_sync({
            "type": "message",
            "data": {
                "packet_id": packet_id,
                "sender": sender,
                "receiver": receiver,
                "channel": channel,
                "text": text,
                "timestamp": packet.get("rxTime"),
                "snr": packet.get("rxSnr"),
                "hop_limit": packet.get("hopLimit"),
                "reply_id": reply_id
            }
        })

    def _handle_position(self, packet):
        decoded = packet.get("decoded", {})
        position = decoded.get("position", {})

        ws_manager.broadcast_sync({
            "type": "position",
            "data": {
                "from": packet.get("fromId"),
                "latitude": position.get("latitude"),
                "longitude": position.get("longitude"),
                "altitude": position.get("altitude"),
                "time": position.get("time")
            }
        })

    def _handle_telemetry(self, packet):
        decoded = packet.get("decoded", {})
        telemetry = decoded.get("telemetry", {})

        ws_manager.broadcast_sync({
            "type": "telemetry",
            "data": {
                "from": packet.get("fromId"),
                "device_metrics": telemetry.get("deviceMetrics"),
                "environment_metrics": telemetry.get("environmentMetrics")
            }
        })

    def _on_connection(self, interface, topic=pub.AUTO_TOPIC):
        ws_manager.broadcast_sync({
            "type": "connection_status",
            "data": {"connected": True, "type": self.connection_type, "address": self.address}
        })

    def _on_connection_lost(self, interface, topic=pub.AUTO_TOPIC):
        logger.warning(f"Connection lost to {self.address}")
        ws_manager.broadcast_sync({
            "type": "connection_status",
            "data": {"connected": False, "reconnecting": True}
        })

        # Save connection info for reconnection
        saved_type = self.connection_type
        saved_address = self.address

        # Clean up current interface
        if self.interface:
            try:
                self.interface.close()
            except Exception:
                pass
        self.interface = None

        # Attempt reconnection if it was TCP connection
        if saved_type == "tcp" and saved_address:
            logger.info(f"Attempting to reconnect to {saved_address}")
            parts = saved_address.split(":")
            hostname = parts[0]
            port = int(parts[1]) if len(parts) > 1 else 4403

            # Try to reconnect
            success = self.connect_tcp(hostname, port)
            if success:
                logger.info(f"Reconnection successful to {saved_address}")
            else:
                logger.error(f"Reconnection failed to {saved_address}")
                self.connection_type = None
                self.address = None

    def _on_node_updated(self, node, interface):
        ws_manager.broadcast_sync({
            "type": "node_update",
            "data": self._format_node(node)
        })

    def _format_node(self, node: dict) -> dict:
        # Convert protobuf objects to dicts for JSON serialization
        user = node.get("user")
        position = node.get("position")
        device_metrics = node.get("deviceMetrics")

        # Deep convert: check if converted dicts still have protobuf objects inside
        def deep_convert(obj):
            if obj is None:
                return None
            if hasattr(obj, 'DESCRIPTOR'):
                obj = MessageToDict(obj)
            if isinstance(obj, dict):
                return {k: deep_convert(v) for k, v in obj.items()}
            if isinstance(obj, list):
                return [deep_convert(item) for item in obj]
            return obj

        # Check if node is favorite - can be stored in different ways depending on meshtastic version
        is_favorite = False

        # Debug: log available keys
        node_id = node.get("user", {}).get("id") if user else None
        logger.debug(f"Node {node_id} keys: {list(node.keys())}")

        if "isFavorite" in node:
            is_favorite = node.get("isFavorite", False)
        # Also check for is_favorite (snake_case variant)
        elif "is_favorite" in node:
            is_favorite = node.get("is_favorite", False)

        logger.debug(f"Node {node_id} isFavorite: {is_favorite}")

        return {
            "id": node.get("user", {}).get("id") if user else None,
            "num": node.get("num"),
            "user": deep_convert(user),
            "position": deep_convert(position),
            "snr": node.get("snr"),
            "lastHeard": node.get("lastHeard"),
            "deviceMetrics": deep_convert(device_metrics),
            "isFavorite": is_favorite
        }

    def get_nodes(self) -> list:
        if not self.interface or not self.interface.nodes:
            return []
        return [self._format_node(n) for n in self.interface.nodes.values()]

    def get_node(self, node_id: str) -> Optional[dict]:
        if not self.interface or not self.interface.nodes:
            return None
        for node in self.interface.nodes.values():
            if node.get("user", {}).get("id") == node_id or str(node.get("num")) == node_id:
                return self._format_node(node)
        return None

    def get_channels(self) -> list:
        if not self.interface or not self.interface.localNode:
            return []
        channels = []
        local_channels = self.interface.localNode.channels
        if local_channels:
            for i, ch in enumerate(local_channels):
                if ch and ch.role != 0:
                    channels.append({
                        "index": i,
                        "name": ch.settings.name or f"Channel {i}",
                        "role": ["DISABLED", "PRIMARY", "SECONDARY"][ch.role] if ch.role < 3 else "UNKNOWN"
                    })
        return channels

    def get_config(self) -> dict:
        if not self.interface or not self.interface.localNode:
            return {}

        config = {}
        local_node = self.interface.localNode

        if local_node.localConfig:
            config["localConfig"] = MessageToDict(local_node.localConfig)
        if local_node.moduleConfig:
            config["moduleConfig"] = MessageToDict(local_node.moduleConfig)

        return config

    def send_message(self, text: str, destination_id: Optional[str] = None, channel_index: int = 0, reply_id: Optional[int] = None) -> Optional[int]:
        if not self.interface:
            return None

        try:
            result = self.interface.sendText(
                text=text,
                destinationId=destination_id or "^all",
                wantAck=True,
                channelIndex=channel_index,
                replyId=reply_id
            )
            packet_id = result.id if result else None

            self._run_async(db.save_message(
                packet_id=packet_id,
                sender=self.my_node_id or "local",
                receiver=destination_id,
                channel=channel_index,
                text=text,
                is_outgoing=True,
                ack_status="pending",
                reply_id=reply_id
            ))

            return packet_id
        except Exception as e:
            logger.error(f"Send error: {e}")
            return None

    def send_traceroute(self, dest: str, hop_limit: int = 7, channel_index: int = 0) -> bool:
        """Send traceroute without blocking wait for response.

        Uses low-level sendData instead of sendTraceRoute to avoid
        the blocking waitForTraceRoute call that can hang indefinitely.
        Response will arrive via _handle_traceroute_response callback.
        """
        if not self.interface:
            return False
        try:
            from meshtastic import mesh_pb2, portnums_pb2

            r = mesh_pb2.RouteDiscovery()
            self.interface.sendData(
                r,
                destinationId=dest,
                portNum=portnums_pb2.PortNum.TRACEROUTE_APP,
                wantResponse=True,
                channelIndex=channel_index,
                hopLimit=hop_limit,
            )
            logger.info(f"Traceroute sent to {dest} (non-blocking)")
            return True
        except Exception as e:
            logger.error(f"Traceroute error: {e}")
            return False

    def set_favorite(self, node_id: str, is_favorite: bool) -> bool:
        """Set favorite status for a node.

        Args:
            node_id: Node ID in format "!12345678" or as string
            is_favorite: True to mark as favorite, False to unmark

        Returns:
            True if successful, False otherwise
        """
        if not self.interface or not self.interface.localNode:
            logger.error("Not connected to device")
            return False

        try:
            # Use the built-in setFavorite/removeFavorite methods from localNode
            # These handle all the admin message complexity internally
            if is_favorite:
                self.interface.localNode.setFavorite(node_id)
            else:
                self.interface.localNode.removeFavorite(node_id)

            # Update local cache immediately so the UI reflects the change without waiting for device response
            # Find the node in our cache and update it
            # Convert node_id to a comparable format
            node_hex = node_id if node_id.startswith("!") else f"!{node_id}"

            # Find and update the node in interface.nodes cache
            if hasattr(self.interface, 'nodes') and self.interface.nodes:
                for node_num, node_data in self.interface.nodes.items():
                    # Get the node's user ID
                    user_id = node_data.get("user", {}).get("id") if isinstance(node_data.get("user"), dict) else None
                    if user_id == node_hex or user_id == node_id:
                        # Update the isFavorite field in the cached node
                        if "isFavorite" not in node_data:
                            node_data["isFavorite"] = is_favorite
                        else:
                            node_data["isFavorite"] = is_favorite
                        logger.debug(f"Updated local cache for node {node_id}: isFavorite={is_favorite}")
                        break

            logger.info(f"Set favorite={is_favorite} for node {node_id}")
            return True
        except Exception as e:
            logger.error(f"Error setting favorite: {e}")
            return False

    def get_status(self) -> dict:
        status = {
            "connected": self.connected,
            "connection_type": self.connection_type,
            "address": self.address,
            "my_node_id": self.my_node_id,
            "my_node_num": self.my_node_num
        }
        return status


mesh_manager = MeshtasticManager()
