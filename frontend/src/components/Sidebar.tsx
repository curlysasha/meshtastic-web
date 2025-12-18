import { useState } from 'react'
import { Hash, User, Radio, Battery, Signal, ArrowUpDown, Search, X } from 'lucide-react'
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
  const { currentChat, setActiveTab, setSelectedNode, selectedNode, status, getUnreadForChat } = useMeshStore()
  const { data: nodes } = useNodes()
  const { data: channels } = useChannels()
  const [sortBy, setSortBy] = useState<SortType>('name')
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const formatLastHeard = (timestamp?: number) => {
    if (!timestamp) return ''
    const now = Date.now()
    const diff = Math.floor((now - timestamp * 1000) / 1000)

    if (diff < 60) return `${diff}s`
    if (diff < 3600) return `${Math.floor(diff / 60)}m`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`
    return `${Math.floor(diff / 86400)}d`
  }

  // Filter and Sort nodes
  const processedNodes = nodes ? [...nodes]
    .filter(n => {
      if (!searchQuery) return true
      const query = searchQuery.toLowerCase()
      const name = getNodeName(n).toLowerCase()
      const shortName = n.user?.shortName?.toLowerCase() || ''
      const id = n.id?.toLowerCase() || ''
      return name.includes(query) || shortName.includes(query) || id.includes(query)
    })
    .sort((a, b) => {
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

  const getUnread = (nodeId: string) => getUnreadForChat(`dm:${nodeId}`)

  // Split into unread and regular, respecting the filter
  const unreadNodes = processedNodes.filter((node) => getUnread(node.id) > 0)
  const regularNodes = processedNodes.filter((node) => getUnread(node.id) === 0)

  const renderNodeButton = (node: (typeof processedNodes)[number], unreadCount: number) => (
    <button
      key={node.id || node.num}
      onClick={() => {
        setSelectedNode(node)
      }}
      className={cn(
        'w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm hover:bg-accent transition-colors',
        ((currentChat?.type === 'dm' && currentChat.nodeId === node.id) || selectedNode?.id === node.id) &&
        'bg-accent'
      )}
    >
      <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      <div className="flex-1 text-left min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="truncate">
            {getNodeName(node)}
            {node.user?.shortName && <span className="ml-1 text-muted-foreground text-xs font-normal">({node.user.shortName})</span>}
          </span>
          {unreadCount > 0 && (
            <span className="bg-primary text-primary-foreground text-xs font-medium px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center flex-shrink-0">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="truncate mr-2 font-mono opacity-70">
            {node.user?.id || node.num}
          </span>
          <span>{formatLastHeard(node.lastHeard)}</span>
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

  return (
    <div className="w-[420px] bg-card border-r border-border flex flex-col h-full">
      {/* Header */}
      <div className="h-14 px-4 border-b border-border flex items-center justify-between shrink-0">
        <div className="font-semibold text-lg flex items-center gap-2">
          <Hash className="w-5 h-5" />
          Meshtastic
        </div>
        <div className="flex items-center gap-1">
          <ConnectionPanel />
        </div>
      </div>

      {channels && channels.length > 0 ? (
        <ScrollArea className="flex-1">
          {/* Channels */}
          <div className="p-2">
            <div className="text-xs font-semibold text-muted-foreground uppercase px-2 py-1 mb-1">
              Test Channels
            </div>
            {channels.map((channel) => (
              <button
                key={channel.index}
                onClick={() => setActiveTab({
                  type: 'channel',
                  index: channel.index,
                  name: channel.name,
                })}
                className={cn(
                  'w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm hover:bg-accent transition-colors',
                  currentChat?.type === 'channel' &&
                  currentChat.index === channel.index &&
                  'bg-accent'
                )}
              >
                <Hash className="w-4 h-4 text-muted-foreground" />
                <span className="truncate font-medium">
                  {channel.name || `Channel ${channel.index}`}
                </span>
              </button>
            ))}
          </div>

          <div className="h-px bg-border mx-2 my-1" />

          {/* Nodes */}
          <div className="p-2">
            <div className="flex items-center justify-between px-2 py-1 mb-1">
              <div className="text-xs font-semibold text-muted-foreground uppercase">
                Nodes ({nodes?.length || 0})
              </div>
              <div className="flex items-center gap-1">
                {isSearchOpen ? (
                  <div className="flex items-center bg-muted rounded-md px-2 h-7 animate-in fade-in zoom-in duration-200">
                    <Search className="w-3 h-3 text-muted-foreground mr-1.5" />
                    <input
                      autoFocus
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Поиск..."
                      className="bg-transparent border-none text-xs focus:outline-none w-24 placeholder:text-muted-foreground/50"
                    />
                    <button
                      onClick={() => {
                        setSearchQuery('')
                        setIsSearchOpen(false)
                      }}
                      className="ml-1 hover:text-foreground text-muted-foreground"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    title="Поиск"
                    onClick={() => setIsSearchOpen(true)}
                  >
                    <Search className="h-3.5 w-3.5" />
                  </Button>
                )}

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
            </div>

            {unreadNodes.length > 0 && (
              <div className="mb-2">
                <div className="text-[11px] font-semibold text-primary uppercase px-2 py-1">
                  Unread
                </div>
                {unreadNodes.map((node) => renderNodeButton(node, getUnread(node.id)))}
              </div>
            )}

            {regularNodes.map((node) => renderNodeButton(node, getUnread(node.id)))}
          </div>
        </ScrollArea>
      ) : (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          No connection
        </div>
      )}
    </div>
  )
}
