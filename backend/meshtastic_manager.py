import asyncio
import logging
from typing import Optional, Dict, Any, Set
from concurrent.futures import Future
from pubsub import pub
import meshtastic
import meshtastic.serial_interface
import meshtastic.tcp_interface
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
        try:
            self.interface = meshtastic.serial_interface.SerialInterface(devPath=dev_path)
            self.connection_type = "serial"
            self.address = dev_path
            self._setup_callbacks()
            return True
        except Exception as e:
            logger.error(f"Serial connection error: {e}")
            self.interface = None
            return False

    def connect_tcp(self, hostname: str, port: int = 4403) -> bool:
        self.disconnect()
        try:
            self.interface = meshtastic.tcp_interface.TCPInterface(hostname=hostname, portNumber=port)
            self.connection_type = "tcp"
            self.address = f"{hostname}:{port}"
            self._setup_callbacks()
            return True
        except Exception as e:
            logger.error(f"TCP connection error: {e}")
            self.interface = None
            return False

    def disconnect(self):
        if self.interface:
            try:
                self.interface.close()
            except Exception:
                pass
            self.interface = None
            self.connection_type = None
            self.address = None
            self._unsubscribe_all()

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

        ws_manager.broadcast_sync({
            "type": "traceroute",
            "data": {
                "request_id": request_id,
                "from": packet.get("fromId"),
                "route": traceroute_data.get("route", []),
                "snr_towards": traceroute_data.get("snrTowards", []),
                "snr_back": traceroute_data.get("snrBack", [])
            }
        })

    def _handle_text_message(self, packet):
        decoded = packet.get("decoded", {})
        text = decoded.get("text", "")
        sender = packet.get("fromId", "unknown")
        receiver = packet.get("toId")
        channel = packet.get("channel", 0)
        packet_id = packet.get("id")

        self._run_async(db.save_message(
            packet_id=packet_id,
            sender=sender,
            receiver=receiver if receiver != "^all" else None,
            channel=channel,
            text=text,
            is_outgoing=False,
            ack_status="received"
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
                "hop_limit": packet.get("hopLimit")
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
        ws_manager.broadcast_sync({
            "type": "connection_status",
            "data": {"connected": False}
        })
        self.interface = None
        self.connection_type = None
        self.address = None

    def _on_node_updated(self, node, topic=pub.AUTO_TOPIC):
        ws_manager.broadcast_sync({
            "type": "node_update",
            "data": self._format_node(node)
        })

    def _format_node(self, node: dict) -> dict:
        return {
            "id": node.get("user", {}).get("id"),
            "num": node.get("num"),
            "user": node.get("user"),
            "position": node.get("position"),
            "snr": node.get("snr"),
            "lastHeard": node.get("lastHeard"),
            "deviceMetrics": node.get("deviceMetrics")
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

    def send_message(self, text: str, destination_id: Optional[str] = None, channel_index: int = 0) -> Optional[int]:
        if not self.interface:
            return None

        try:
            result = self.interface.sendText(
                text=text,
                destinationId=destination_id or "^all",
                wantAck=True,
                channelIndex=channel_index
            )
            packet_id = result.id if result else None

            self._run_async(db.save_message(
                packet_id=packet_id,
                sender=self.my_node_id or "local",
                receiver=destination_id,
                channel=channel_index,
                text=text,
                is_outgoing=True,
                ack_status="pending"
            ))

            return packet_id
        except Exception as e:
            logger.error(f"Send error: {e}")
            return None

    def send_traceroute(self, dest: str, hop_limit: int = 7, channel_index: int = 0) -> bool:
        if not self.interface:
            return False
        try:
            self.interface.sendTraceRoute(dest=dest, hopLimit=hop_limit, channelIndex=channel_index)
            return True
        except Exception as e:
            logger.error(f"Traceroute error: {e}")
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
