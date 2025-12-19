import { useState, useRef, useEffect, useMemo } from 'react'
import { Send, Hash, User, X, Reply } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { MessageBubble } from './MessageBubble'
import { ChatTabs } from './ChatTabs'
import { DateDivider } from './DateDivider'
import { useMeshStore } from '@/store'
import { useSendMessage, useMessages } from '@/hooks/useApi'
import { cn } from '@/lib/utils'
import { isSameDay } from 'date-fns'
import type { Message } from '@/types'

export function ChatArea() {
  const [text, setText] = useState('')
  const [replyingTo, setReplyingTo] = useState<Message | null>(null)
  const scrollViewportRef = useRef<HTMLDivElement>(null)
  const currentChat = useMeshStore((s) => s.currentChat)
  const messages = useMeshStore((s) => s.messages)
  const status = useMeshStore((s) => s.status)
  const nodes = useMeshStore((s) => s.nodes)
  const resetUnreadForChat = useMeshStore((s) => s.resetUnreadForChat)
  const [isPageActive, setIsPageActive] = useState(() =>
    typeof document !== 'undefined'
      ? document.visibilityState === 'visible' && document.hasFocus()
      : true
  )

  const sendMessage = useSendMessage()

  // Load messages for current chat
  useMessages(
    currentChat?.type === 'channel' ? currentChat.index : undefined,
    currentChat?.type === 'dm' ? currentChat.nodeId : undefined
  )

  // Reset unread count when opening a chat
  const chatKey = currentChat
    ? currentChat.type === 'channel'
      ? `channel:${currentChat.index}`
      : `dm:${currentChat.nodeId}`
    : ''

  // Track page/tab visibility to decide when a message is actually read
  useEffect(() => {
    const updateVisibility = () => {
      const isVisible = document.visibilityState === 'visible' && document.hasFocus()
      setIsPageActive(isVisible)
    }

    document.addEventListener('visibilitychange', updateVisibility)
    window.addEventListener('focus', updateVisibility)
    window.addEventListener('blur', updateVisibility)

    return () => {
      document.removeEventListener('visibilitychange', updateVisibility)
      window.removeEventListener('focus', updateVisibility)
      window.removeEventListener('blur', updateVisibility)
    }
  }, [])

  useEffect(() => {
    if (!chatKey || !isPageActive) return

    resetUnreadForChat(chatKey)
  }, [chatKey, isPageActive, resetUnreadForChat])

  // Filter messages for current chat
  const filteredMessages = messages.filter((m) => {
    if (!currentChat) return false
    if (currentChat.type === 'channel') {
      // Channel message: on this channel AND (no receiver OR receiver is broadcast)
      return m.channel === currentChat.index && (!m.receiver || m.receiver === '^all' || m.receiver === 'broadcast')
    }
    // DM: receiver is specific node (not broadcast) AND matches current chat
    return (
      (m.sender === currentChat.nodeId || m.receiver === currentChat.nodeId) &&
      m.receiver && m.receiver !== '^all' && m.receiver !== 'broadcast'
    )
  })

  // Detect and group reactions
  // Regex for a string containing ONLY emojis (and optional whitespace)
  // Using a simplified robust range for common emojis + newer ones
  const EMOJI_ONLY_REGEX = /^(\p{Extended_Pictographic}|\p{Emoji_Presentation}|\s)+$/u

  const processedMessages = useMemo(() => {
    const result: (Message & {
      showDateDivider?: boolean
      isGroupStart?: boolean
      isGroupEnd?: boolean
    })[] = []

    // Sort by timestamp to ensure correct order
    const sorted = [...filteredMessages].sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    )

    // First pass: extract reactions and build the base message list
    sorted.forEach((msg) => {
      const isEmoji = EMOJI_ONLY_REGEX.test(msg.text.trim())

      // In Meshtastic, a reaction is an emoji-only message that REPLIES to another message
      if (isEmoji && msg.reply_id) {
        // Find the target message by packet_id (replies reference packet_id)
        const target = result.find(m => m.packet_id === msg.reply_id || m.id === msg.reply_id)
        if (target) {
          if (!target.reactions) target.reactions = {}
          const emoji = msg.text.trim()
          if (!target.reactions[emoji]) target.reactions[emoji] = []
          if (!target.reactions[emoji].includes(msg.sender)) {
            target.reactions[emoji].push(msg.sender)
          }
          return // Found target, skip adding as standalone message
        }
      }

      // If not a reaction (or target not found), add as regular message
      result.push({
        ...msg,
        reactions: { ...msg.reactions } // Keep existing reactions if any
      })
    })

    // Second pass: calculate dividers and grouping for the resulting messages
    result.forEach((msg, idx) => {
      const prevMsg = idx > 0 ? result[idx - 1] : null
      const nextMsg = idx < result.length - 1 ? result[idx + 1] : null

      // Date Divider logic
      msg.showDateDivider = !prevMsg || !isSameDay(new Date(msg.timestamp), new Date(prevMsg.timestamp))

      // Grouping logic (same sender, within 5 minutes)
      const isSameSenderAsPrev = prevMsg && prevMsg.sender === msg.sender
      const timeDiffPrev = prevMsg ? Math.abs(new Date(msg.timestamp).getTime() - new Date(prevMsg.timestamp).getTime()) : Infinity
      msg.isGroupStart = msg.showDateDivider || !isSameSenderAsPrev || timeDiffPrev > 5 * 60 * 1000

      const isSameSenderAsNext = nextMsg && nextMsg.sender === msg.sender
      const timeDiffNext = nextMsg ? Math.abs(new Date(nextMsg.timestamp).getTime() - new Date(msg.timestamp).getTime()) : Infinity
      msg.isGroupEnd = !isSameSenderAsNext || timeDiffNext > 5 * 60 * 1000
    })

    return result
  }, [filteredMessages])

  // Auto-scroll to bottom
  useEffect(() => {
    const viewport = scrollViewportRef.current
    if (!viewport) return

    requestAnimationFrame(() => {
      viewport.scrollTop = viewport.scrollHeight
    })
  }, [processedMessages.length, chatKey, replyingTo])

  const handleSend = () => {
    if (!text.trim() || !currentChat) return

    sendMessage.mutate({
      text: text.trim(),
      destination_id: currentChat.type === 'dm' ? currentChat.nodeId : undefined,
      channel_index: currentChat.type === 'channel' ? currentChat.index : 0,
      reply_id: replyingTo?.packet_id,
    })

    setText('')
    setReplyingTo(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    } else if (e.key === 'Escape' && replyingTo) {
      setReplyingTo(null)
    }
  }

  const getSenderName = (message: Message) => {
    const node = nodes.find((n) => n.id === message.sender)
    return node?.user?.longName || node?.user?.shortName || message.sender
  }

  if (!status.connected) {
    return (
      <div className="flex-1 flex flex-col h-full">
        <ChatTabs />
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <p className="text-lg mb-2">Not connected</p>
            <p className="text-sm">Connect to a Meshtastic node to start chatting</p>
          </div>
        </div>
      </div>
    )
  }

  if (!currentChat) {
    return (
      <div className="flex-1 flex flex-col h-full">
        <ChatTabs />
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <p className="text-lg mb-2">Select a channel or node</p>
            <p className="text-sm">Choose from the sidebar to start messaging</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Tabs */}
      <ChatTabs />

      {/* Header */}
      <div className="h-14 px-4 border-b border-border flex items-center gap-3 bg-card/50">
        {currentChat.type === 'channel' ? (
          <Hash className="w-5 h-5 text-muted-foreground" />
        ) : (
          <User className="w-5 h-5 text-muted-foreground" />
        )}
        <div>
          <h2 className="font-semibold">{currentChat.name}</h2>
          <p className="text-xs text-muted-foreground">
            {currentChat.type === 'channel' ? 'Channel' : 'Direct Message'}
          </p>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" viewportRef={scrollViewportRef}>
        <div className="flex flex-col gap-1 min-h-full">
          {processedMessages.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No messages yet. Start the conversation!
            </div>
          ) : (
            processedMessages.map((message) => (
              <div key={message.packet_id || message.id}>
                {message.showDateDivider && (
                  <DateDivider date={message.timestamp} />
                )}
                <MessageBubble
                  message={message}
                  onReply={() => setReplyingTo(message)}
                  isGroupStart={message.isGroupStart}
                  isGroupEnd={message.isGroupEnd}
                />
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Reply Preview */}
      {replyingTo && (
        <div className="mx-4 mb-0 p-3 bg-muted/50 border border-border border-b-0 rounded-t-lg flex items-start gap-3 animate-in slide-in-from-bottom-2 duration-200">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-primary mb-1">
              <Reply className="w-3 h-3" />
              Replying to {getSenderName(replyingTo)}
            </div>
            <p className="text-xs text-muted-foreground truncate italic">
              "{replyingTo.text}"
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 -mr-1"
            onClick={() => setReplyingTo(null)}
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      )}

      {/* Input */}
      <div className={cn(
        "p-4 border-t border-border bg-card/50 transition-colors",
        replyingTo && "border-t-0 bg-muted/20"
      )}>
        <div className="flex gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${currentChat.name}...`}
            className="flex-1 shadow-sm"
          />
          <Button
            onClick={handleSend}
            disabled={!text.trim() || sendMessage.isPending}
            size="icon"
            className="shrink-0"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
