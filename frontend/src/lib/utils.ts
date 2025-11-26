import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatTime(timestamp: string | number): string {
  const date = new Date(typeof timestamp === 'number' ? timestamp * 1000 : timestamp)
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

export function formatDate(timestamp: string | number): string {
  const date = new Date(typeof timestamp === 'number' ? timestamp * 1000 : timestamp)
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

export function getNodeName(node: { user?: { longName?: string; shortName?: string }; id?: string }): string {
  return node.user?.longName || node.user?.shortName || node.id || 'Unknown'
}

export function formatNodeId(id: string): string {
  if (id.startsWith('!')) return id
  return `!${parseInt(id).toString(16).padStart(8, '0')}`
}
