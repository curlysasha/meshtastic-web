import { create } from 'zustand'
import type { Node, Channel, Message, ConnectionStatus, ChatTarget, TracerouteResult } from '@/types'

interface MeshState {
  // Connection
  status: ConnectionStatus
  setStatus: (status: ConnectionStatus) => void

  // Nodes
  nodes: Node[]
  setNodes: (nodes: Node[]) => void
  updateNode: (node: Node) => void

  // Channels
  channels: Channel[]
  setChannels: (channels: Channel[]) => void

  // Messages
  messages: Message[]
  addMessage: (message: Message) => void
  setMessages: (messages: Message[]) => void
  updateMessageAck: (packetId: number, status: Message['ack_status']) => void

  // Current chat target
  currentChat: ChatTarget | null
  setCurrentChat: (target: ChatTarget | null) => void

  // Traceroute
  tracerouteResult: TracerouteResult | null
  setTracerouteResult: (result: TracerouteResult | null) => void

  // Selected node for info panel
  selectedNode: Node | null
  setSelectedNode: (node: Node | null) => void

  // Notifications
  unreadCount: number
  incrementUnread: () => void
  resetUnread: () => void

  // Unread messages per chat
  unreadPerChat: Record<string, number>
  incrementUnreadForChat: (chatKey: string) => void
  resetUnreadForChat: (chatKey: string) => void
  getUnreadForChat: (chatKey: string) => number
}

export const useMeshStore = create<MeshState>((set, get) => ({
  status: { connected: false },
  setStatus: (status) => set({ status }),

  nodes: [],
  setNodes: (nodes) => set({ nodes }),
  updateNode: (node) =>
    set((state) => {
      const idx = state.nodes.findIndex((n) => n.id === node.id || n.num === node.num)
      if (idx >= 0) {
        const newNodes = [...state.nodes]
        newNodes[idx] = { ...newNodes[idx], ...node }
        return { nodes: newNodes }
      }
      return { nodes: [...state.nodes, node] }
    }),

  channels: [],
  setChannels: (channels) => set({ channels }),

  messages: [],
  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message],
    })),
  setMessages: (messages) => set({ messages }),
  updateMessageAck: (packetId, ackStatus) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.packet_id === packetId ? { ...m, ack_status: ackStatus } : m
      ),
    })),

  currentChat: null,
  setCurrentChat: (target) => set({ currentChat: target }),

  tracerouteResult: null,
  setTracerouteResult: (result) => set({ tracerouteResult: result }),

  selectedNode: null,
  setSelectedNode: (node) => set({ selectedNode: node }),

  unreadCount: 0,
  incrementUnread: () => set((state) => ({ unreadCount: state.unreadCount + 1 })),
  resetUnread: () => set({ unreadCount: 0 }),

  unreadPerChat: {},
  incrementUnreadForChat: (chatKey) =>
    set((state) => ({
      unreadPerChat: {
        ...state.unreadPerChat,
        [chatKey]: (state.unreadPerChat[chatKey] || 0) + 1,
      },
    })),
  resetUnreadForChat: (chatKey) =>
    set((state) => {
      const { [chatKey]: _, ...rest } = state.unreadPerChat
      return { unreadPerChat: rest }
    }),
  getUnreadForChat: (chatKey: string): number => {
    return get().unreadPerChat[chatKey] || 0
  },
}))
