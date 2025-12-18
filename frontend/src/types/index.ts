export interface Node {
  id: string
  num: number
  user?: {
    id: string
    longName: string
    shortName: string
    hwModel: string
  }
  position?: {
    latitude: number
    longitude: number
    altitude: number
    time: number
  }
  snr?: number
  lastHeard?: number
  deviceMetrics?: {
    batteryLevel: number
    voltage: number
    channelUtilization: number
    airUtilTx: number
  }
}

export interface Channel {
  index: number
  name: string
  role: string
}

export interface Message {
  id: number
  packet_id?: number
  sender: string
  receiver?: string
  channel: number
  text: string
  timestamp: string
  ack_status: 'pending' | 'ack' | 'nak' | 'implicit_ack' | 'received' | 'failed'
  is_outgoing?: boolean
  reactions?: Record<string, string[]> // emoji -> [senderIds]
  reply_id?: number
}

export interface ConnectionStatus {
  connected: boolean
  connection_type?: string
  address?: string
  my_node_id?: string
  my_node_num?: number
}

export interface TracerouteResult {
  request_id: number
  from: string
  route: number[]
  route_back: number[]
  snr_towards: number[]
  snr_back: number[]
}

export interface WSMessage {
  type: 'message' | 'ack' | 'node_update' | 'connection_status' | 'traceroute' | 'position' | 'telemetry'
  data: Record<string, unknown>
}

export type ChatTarget =
  | { type: 'channel'; index: number; name: string }
  | { type: 'dm'; nodeId: string; name: string }

export interface OpenTab {
  id: string // unique key: "channel:0" or "dm:!abc123"
  target: ChatTarget
}
