import { useEffect, useRef } from 'react'
import { useMeshStore } from '@/store'
import type { Message, Node, ConnectionStatus, TracerouteResult } from '@/types'

const NOTIFICATION_SOUND = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleQ0bXpPT5LyNMx06hbnU2JBFKTE5fLTIxoM/NTU7e7PEwHs2NS89fLPCu3U1Nz0+frLBt3E2OT5Bf7K/tG84O0BBgbK9sW05PEFDg7K7rmw6PUJFQ4Owuqtq'

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectRef = useRef<ReturnType<typeof setTimeout>>()
  const reconnectAttempts = useRef(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Use refs to avoid stale closures
  const storeRef = useRef(useMeshStore.getState())

  useEffect(() => {
    return useMeshStore.subscribe((state) => {
      storeRef.current = state
    })
  }, [])

  const playNotification = () => {
    if (!audioRef.current) {
      audioRef.current = new Audio(NOTIFICATION_SOUND)
      audioRef.current.volume = 0.3
    }
    audioRef.current.play().catch(() => {})
  }

  const connect = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`)

    ws.onopen = () => {
      console.log('WebSocket connected')
      reconnectAttempts.current = 0
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        const store = storeRef.current

        switch (msg.type) {
          case 'connection_status':
            store.setStatus(msg.data as ConnectionStatus)
            break

          case 'message': {
            const data = msg.data as {
              packet_id: number
              sender: string
              receiver?: string
              channel: number
              text: string
              timestamp?: number
              snr?: number
              hop_limit?: number
            }

            store.addMessage({
              id: data.packet_id || Date.now(),
              packet_id: data.packet_id,
              sender: data.sender,
              receiver: data.receiver,
              channel: data.channel,
              text: data.text,
              timestamp: data.timestamp
                ? new Date(data.timestamp * 1000).toISOString()
                : new Date().toISOString(),
              ack_status: 'received',
              is_outgoing: false,
            })

            const currentChat = store.currentChat
            const isCurrentChat =
              currentChat?.type === 'channel' && currentChat.index === data.channel

            if (!isCurrentChat) {
              store.incrementUnread()
              playNotification()
            }
            break
          }

          case 'ack':
            store.updateMessageAck(
              msg.data.packet_id as number,
              msg.data.status as Message['ack_status']
            )
            break

          case 'node_update':
            store.updateNode(msg.data as Node)
            break

          case 'traceroute':
            store.setTracerouteResult(msg.data as TracerouteResult)
            break

          case 'position':
          case 'telemetry':
            if (msg.data.from) {
              store.updateNode({ id: msg.data.from, num: 0, ...msg.data } as Node)
            }
            break

          case 'ping':
            // Server ping, ignore
            break
        }
      } catch (e) {
        console.error('WS message parse error:', e)
      }
    }

    ws.onclose = () => {
      console.log('WebSocket disconnected')
      wsRef.current = null

      // Exponential backoff with max 30s
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000)
      if (reconnectAttempts.current < 10) {
        reconnectRef.current = setTimeout(() => {
          reconnectAttempts.current++
          connect()
        }, delay)
      }
    }

    ws.onerror = (error) => {
      console.error('WebSocket error:', error)
    }

    wsRef.current = ws
  }

  useEffect(() => {
    connect()
    return () => {
      clearTimeout(reconnectRef.current)
      wsRef.current?.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return wsRef
}
