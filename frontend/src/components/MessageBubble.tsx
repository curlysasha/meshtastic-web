import { Check, CheckCheck, X, Clock } from 'lucide-react'
import type { Message } from '@/types'
import { cn, formatTime, getNodeName } from '@/lib/utils'
import { useMeshStore } from '@/store'

interface Props {
  message: Message
}

export function MessageBubble({ message }: Props) {
  const status = useMeshStore((s) => s.status)
  const nodes = useMeshStore((s) => s.nodes)

  const isOutgoing = message.is_outgoing || message.sender === status.my_node_id
  const senderNode = nodes.find((n) => n.id === message.sender)
  const senderName = isOutgoing ? 'You' : getNodeName(senderNode || { id: message.sender })

  const AckIcon = () => {
    switch (message.ack_status) {
      case 'pending':
        return <Clock className="w-3 h-3 text-muted-foreground" />
      case 'ack':
        return <CheckCheck className="w-3 h-3 text-green-500" />
      case 'implicit_ack':
        return <Check className="w-3 h-3 text-green-500" />
      case 'nak':
      case 'failed':
        return <X className="w-3 h-3 text-red-500" />
      case 'received':
        return <Check className="w-3 h-3 text-muted-foreground" />
      default:
        return null
    }
  }

  return (
    <div
      className={cn(
        'flex flex-col max-w-[70%] mb-2',
        isOutgoing ? 'ml-auto items-end' : 'mr-auto items-start'
      )}
    >
      {!isOutgoing && (
        <span className="text-xs text-muted-foreground mb-1 px-1">
          {senderName}
        </span>
      )}
      <div
        className={cn(
          'rounded-2xl px-4 py-2 break-words',
          isOutgoing
            ? 'bg-primary text-primary-foreground rounded-br-sm'
            : 'bg-secondary text-secondary-foreground rounded-bl-sm'
        )}
      >
        <p className="text-sm whitespace-pre-wrap">{message.text}</p>
      </div>
      <div className="flex items-center gap-1 px-1 mt-0.5">
        <span className="text-xs text-muted-foreground">
          {formatTime(message.timestamp)}
        </span>
        {isOutgoing && <AckIcon />}
      </div>
    </div>
  )
}
