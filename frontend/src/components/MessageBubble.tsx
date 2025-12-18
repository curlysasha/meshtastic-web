import { Check, CheckCheck, X, Clock, CornerUpLeft } from 'lucide-react'
import type { Message } from '@/types'
import { cn, formatTime } from '@/lib/utils'
import { useMeshStore } from '@/store'

interface Props {
  message: Message
  onReply?: () => void
}

export function MessageBubble({ message, onReply }: Props) {
  const status = useMeshStore((s) => s.status)
  const nodes = useMeshStore((s) => s.nodes)
  const messages = useMeshStore((s) => s.messages)

  const isOutgoing = message.is_outgoing || message.sender === status.my_node_id
  const senderNode = nodes.find((n) => n.id === message.sender)

  // Find message being replied to
  const repliedMessage = message.reply_id
    ? messages.find(m => m.packet_id === message.reply_id || m.id === message.reply_id)
    : null

  const repliedSenderNode = repliedMessage
    ? nodes.find(n => n.id === repliedMessage.sender)
    : null

  const getSenderName = (node: any, id: string) => {
    if (id === status.my_node_id) return 'You'
    return node?.user?.longName || node?.user?.shortName || id
  }

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
        'flex flex-col max-w-[85%] mb-2 group/bubble',
        isOutgoing ? 'ml-auto items-end' : 'mr-auto items-start'
      )}
    >
      <div className="relative group flex items-start gap-2">
        {!isOutgoing && onReply && (
          <button
            onClick={onReply}
            className="opacity-0 group-hover/bubble:opacity-100 transition-opacity p-1.5 hover:bg-muted rounded-full mt-2 shrink-0"
            title="Reply"
          >
            <CornerUpLeft className="w-4 h-4 text-muted-foreground" />
          </button>
        )}

        <div
          className={cn(
            'rounded-2xl px-3 py-2 break-words flex flex-col gap-1 shadow-sm border',
            isOutgoing
              ? 'bg-primary text-primary-foreground rounded-br-sm border-primary/50'
              : 'bg-secondary text-secondary-foreground rounded-bl-sm border-border'
          )}
        >
          {/* Reply Context */}
          {repliedMessage && (
            <div className={cn(
              "mb-1 p-2 rounded-lg border-l-4 text-xs bg-black/5 flex flex-col gap-0.5 max-w-full overflow-hidden",
              isOutgoing ? "border-primary-foreground/30 text-primary-foreground/90" : "border-primary/50 text-muted-foreground"
            )}>
              <span className="font-bold opacity-80">
                {getSenderName(repliedSenderNode, repliedMessage.sender)}
              </span>
              <p className="truncate italic opacity-70">
                {repliedMessage.text}
              </p>
            </div>
          )}

          {/* Sender Header */}
          <div className="flex items-center gap-1.5 opacity-90 mb-0.5">
            {senderNode?.user?.shortName && (
              <span className={cn(
                "px-1 py-0 rounded border text-[9px] font-bold tracking-wider uppercase leading-tight",
                isOutgoing ? "border-primary-foreground/30 bg-primary-foreground/10" : "border-foreground/20 bg-foreground/5"
              )}>
                {senderNode.user.shortName}
              </span>
            )}
            <span className="font-bold text-[11px] truncate leading-tight">
              {isOutgoing ? 'You' : (senderNode?.user?.longName || message.sender)}
            </span>
          </div>
          <p className="text-sm whitespace-pre-wrap leading-snug">{message.text}</p>
        </div>

        {isOutgoing && onReply && (
          <button
            onClick={onReply}
            className="opacity-0 group-hover/bubble:opacity-100 transition-opacity p-1.5 hover:bg-muted rounded-full mt-2 shrink-0 order-first"
            title="Reply"
          >
            <CornerUpLeft className="w-4 h-4 text-muted-foreground" />
          </button>
        )}

        {/* Reactions - attached to bottom right */}
        {message.reactions && Object.keys(message.reactions).length > 0 && (
          <div className={cn(
            "absolute -bottom-2 -right-3 flex flex-wrap gap-0.5 justify-end z-10",
            isOutgoing ? "translate-y-1/2" : "translate-y-1/2"
          )}>
            {Object.entries(message.reactions).map(([emoji, senders]) => (
              <div
                key={emoji}
                className="rounded-full px-1 py-0.5 text-lg flex items-center gap-0.5 cursor-default hover:scale-110 transition-transform"
                title={senders.join(', ')}
              >
                <span>{emoji}</span>
                {senders.length > 1 && (
                  <span className="text-muted-foreground font-medium text-[10px]">
                    {senders.length}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
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
