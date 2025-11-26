import { Hash, User, Radio, Battery, Signal } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ConnectionPanel } from './ConnectionPanel'
import { useMeshStore } from '@/store'
import { useNodes, useChannels } from '@/hooks/useApi'
import { cn, getNodeName } from '@/lib/utils'

export function Sidebar() {
  const { currentChat, setCurrentChat, setSelectedNode, status } = useMeshStore()
  const { data: nodes } = useNodes()
  const { data: channels } = useChannels()

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
            {channels?.map((channel) => (
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
                {channel.role === 'PRIMARY' && (
                  <span className="ml-auto text-xs text-primary">P</span>
                )}
              </button>
            ))}
          </div>

          {/* Nodes */}
          <div className="p-2">
            <div className="text-xs font-semibold text-muted-foreground px-2 py-1 uppercase">
              Nodes ({nodes?.length || 0})
            </div>
            {nodes?.map((node) => (
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
                <User className="w-4 h-4 text-muted-foreground" />
                <div className="flex-1 text-left min-w-0">
                  <div className="truncate">{getNodeName(node)}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {node.id}
                  </div>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  {node.deviceMetrics?.batteryLevel !== undefined && (
                    <span className="flex items-center">
                      <Battery className="w-3 h-3 mr-0.5" />
                      {node.deviceMetrics.batteryLevel}%
                    </span>
                  )}
                  {node.snr !== undefined && (
                    <span className="flex items-center">
                      <Signal className="w-3 h-3 mr-0.5" />
                      {node.snr.toFixed(1)}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}
