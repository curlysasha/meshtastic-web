import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useMeshStore } from '@/store'
import type { Node, Channel, Message } from '@/types'

const API_BASE = '/api'

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: 'Request failed' }))
    throw new Error(error.detail || 'Request failed')
  }
  return res.json()
}

export function useNodes() {
  const setNodes = useMeshStore((s) => s.setNodes)

  const query = useQuery({
    queryKey: ['nodes'],
    queryFn: () => fetchApi<Node[]>('/nodes'),
    refetchInterval: 30000,
  })

  useEffect(() => {
    if (query.data) {
      setNodes(query.data)
    }
  }, [query.data, setNodes])

  return query
}

export function useChannels() {
  const setChannels = useMeshStore((s) => s.setChannels)

  const query = useQuery({
    queryKey: ['channels'],
    queryFn: () => fetchApi<Channel[]>('/channels'),
  })

  useEffect(() => {
    if (query.data) {
      setChannels(query.data)
    }
  }, [query.data, setChannels])

  return query
}

export function useMessages(channel?: number, dmPartner?: string) {
  const setMessages = useMeshStore((s) => s.setMessages)

  const query = useQuery({
    queryKey: ['messages', channel, dmPartner],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (typeof channel === 'number') params.set('channel', channel.toString())
      if (dmPartner) params.set('dm_partner', dmPartner)

      return fetchApi<Message[]>(`/messages?${params}`)
    },
    enabled: typeof channel === 'number' || !!dmPartner,
  })

  useEffect(() => {
    if (query.data) {
      setMessages(query.data)
    }
  }, [query.data, setMessages])

  return query
}

export function useConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: () => fetchApi<Record<string, unknown>>('/config'),
  })
}

export function useConnect() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: { type: 'serial' | 'tcp'; address: string }) => {
      return fetchApi<{ success: boolean }>('/connect', {
        method: 'POST',
        body: JSON.stringify(data),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nodes'] })
      queryClient.invalidateQueries({ queryKey: ['channels'] })
    },
  })
}

export function useDisconnect() {
  return useMutation({
    mutationFn: () =>
      fetchApi<{ success: boolean }>('/disconnect', { method: 'POST' }),
  })
}

export function useSendMessage() {
  const addMessage = useMeshStore((s) => s.addMessage)
  const status = useMeshStore((s) => s.status)

  return useMutation({
    mutationFn: async (data: {
      text: string
      destination_id?: string
      channel_index?: number
      reply_id?: number
    }) => {
      const res = await fetchApi<{ success: boolean; packet_id: number }>('/message', {
        method: 'POST',
        body: JSON.stringify(data),
      })

      addMessage({
        id: res.packet_id,
        packet_id: res.packet_id,
        sender: status.my_node_id || 'local',
        receiver: data.destination_id,
        channel: data.channel_index || 0,
        text: data.text,
        timestamp: new Date().toISOString(),
        ack_status: 'pending',
        is_outgoing: true,
        reply_id: data.reply_id,
      })

      return res
    },
  })
}

export function useTraceroute() {
  return useMutation({
    mutationFn: (nodeId: string) =>
      fetchApi<{ success: boolean }>(`/traceroute/${nodeId}`, { method: 'POST' }),
  })
}
