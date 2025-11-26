from pydantic import BaseModel
from typing import Optional, Literal
from datetime import datetime


class ConnectRequest(BaseModel):
    type: Literal["serial", "tcp"]
    address: str


class MessageRequest(BaseModel):
    text: str
    destination_id: Optional[str] = None
    channel_index: int = 0


class MessageResponse(BaseModel):
    id: int
    sender: str
    receiver: Optional[str]
    channel: int
    text: str
    timestamp: datetime
    ack_status: Literal["pending", "ack", "nak", "implicit_ack", "failed"]


class NodeInfo(BaseModel):
    id: str
    num: int
    user: Optional[dict] = None
    position: Optional[dict] = None
    snr: Optional[float] = None
    last_heard: Optional[int] = None
    device_metrics: Optional[dict] = None


class ChannelInfo(BaseModel):
    index: int
    name: str
    role: str


class ConnectionStatus(BaseModel):
    connected: bool
    connection_type: Optional[str] = None
    address: Optional[str] = None
    my_node_id: Optional[str] = None
    my_node_num: Optional[int] = None


class TracerouteRequest(BaseModel):
    hop_limit: int = 7
    channel_index: int = 0


class WSMessage(BaseModel):
    type: str
    data: dict
