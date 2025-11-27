import { useState } from 'react'
import { Hash, User, Radio, Battery, Signal, ArrowUpDown } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ConnectionPanel } from './ConnectionPanel'
import { useMeshStore } from '@/store'
import { useNodes, useChannels } from '@/hooks/useApi'
import { cn, getNodeName } from '@/lib/utils'

type SortType = 'name' | 'lastHeard'

export function Sidebar() {
  const { currentChat, setCurrentChat, setSelectedNode, status, getUnreadForChat } = useMeshStore()
  const { data: nodes } = useNodes()
  const { data: channels } = useChannels()
  const [sortBy, setSortBy] = useState<SortType>('name')

  const formatLastHeard = (timestamp?: number) => {
    if (!timestamp) return ''
    const now = Date.now()
    const diff = Math.floor((now - timestamp * 1000) / 1000)

    if (diff < 60) return `${diff}s`
    if (diff < 3600) return `${Math.floor(diff / 60)}m`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`
    return `${Math.floor(diff / 86400)}d`
  }

  // Sort nodes
  const sortedNodes = nodes ? [...nodes].sort((a, b) => {
    if (sortBy === 'name') {
      const nameA = getNodeName(a).toLowerCase()
      const nameB = getNodeName(b).toLowerCase()
      return nameA.localeCompare(nameB)
    } else {
      // Sort by lastHeard (newest first)
      const timeA = a.lastHeard || 0
      const timeB = b.lastHeard || 0
      return timeB - timeA
    }
  }) : []

  return (
    <div className="w-72 bg-card border-r border-border flex flex-col h-full">
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Radio className="w-6 h-6 text-primary" />
          <h1 className="font-bold text-lg">Meshtastic</h1>
        </div>
      </div>

      <ConnectionPanel />

      {status.connected && (
        <ScrollArea className="flex-1">
          {/* Channels */}
          <div className="p-2">
            <div className="text-xs font-semibold text-muted-foreground px-2 py-1 uppercase">
              Channels
            </div>
            {channels?.map((channel) => {
              const chatKey = `channel:${channel.index}`
              const unreadCount = getUnreadForChat(chatKey)

              return (
                <button
                  key={channel.index}
                  onClick={() =>
                    setCurrentChat({
                      type: 'channel',
                      index: channel.index,
                      name: channel.name,
                    })
                  }
                  className={cn(
                    'w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm hover:bg-accent transition-colors',
                    currentChat?.type === 'channel' &&
                      currentChat.index === channel.index &&
                      'bg-accent'
                  )}
                >
                  <Hash className="w-4 h-4 text-muted-foreground" />
                  <span className="truncate">{channel.name}</span>
                  <div className="ml-auto flex items-center gap-1">
                    {unreadCount > 0 && (
                      <span className="bg-primary text-primary-foreground text-xs font-medium px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                    {channel.role === 'PRIMARY' && (
                      <span className="text-xs text-primary">P</span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Nodes */}
          <div className="p-2">
            <div className="flex items-center justify-between px-2 py-1">
              <div className="text-xs font-semibold text-muted-foreground uppercase">
                Nodes ({nodes?.length || 0})
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    title="Сортировка"
                  >
                    <ArrowUpDown className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setSortBy('name')}>
                    <span className={cn(sortBy === 'name' && 'font-semibold')}>
                      По имени
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortBy('lastHeard')}>
                    <span className={cn(sortBy === 'lastHeard' && 'font-semibold')}>
                      По активности
                    </span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {sortedNodes?.map((node) => {
              const chatKey = `dm:${node.id}`
              const unreadCount = getUnreadForChat(chatKey)

              return (
                <button
                  key={node.id || node.num}
                  onClick={() => {
                    setSelectedNode(node)
                    setCurrentChat({
                      type: 'dm',
                      nodeId: node.id,
                      name: getNodeName(node),
                    })
                  }}
                  className={cn(
                    'w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm hover:bg-accent transition-colors',
                    currentChat?.type === 'dm' &&
                      currentChat.nodeId === node.id &&
                      'bg-accent'
                  )}
                >
                  <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 text-left min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate">{getNodeName(node)}</span>
                      {unreadCount > 0 && (
                        <span className="bg-primary text-primary-foreground text-xs font-medium px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center flex-shrink-0">
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="truncate">{node.id}</span>
                      {node.lastHeard && (
                        <span className="text-muted-foreground/60">
                          {formatLastHeard(node.lastHeard)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-0.5 text-xs text-muted-foreground flex-shrink-0">
                    {node.deviceMetrics?.batteryLevel !== undefined && (
                      <span className="flex items-center">
                        <Battery className="w-3 h-3 mr-0.5" />
                        {node.deviceMetrics.batteryLevel}%
                      </span>
                    )}
                    {node.snr !== undefined && node.snr !== null && (
                      <span className="flex items-center">
                        <Signal className="w-3 h-3 mr-0.5" />
                        {node.snr.toFixed(1)}
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}
