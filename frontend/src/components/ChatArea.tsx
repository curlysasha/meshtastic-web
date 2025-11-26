import { useState, useRef, useEffect } from 'react'
import { Send, Hash, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { MessageBubble } from './MessageBubble'
import { useMeshStore } from '@/store'
import { useSendMessage, useMessages } from '@/hooks/useApi'

export function ChatArea() {
  const [text, setText] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const { currentChat, messages, status } = useMeshStore()

  const sendMessage = useSendMessage()

  // Load messages for current chat
  useMessages(
    currentChat?.type === 'channel' ? currentChat.index : undefined,
    currentChat?.type === 'dm' ? currentChat.nodeId : undefined
  )

  // Filter messages for current chat
  const filteredMessages = messages.filter((m) => {
    if (!currentChat) return false
    if (currentChat.type === 'channel') {
      return m.channel === currentChat.index && !m.receiver
    }
    // DM
    return (
      (m.sender === currentChat.nodeId || m.receiver === currentChat.nodeId) &&
      m.channel === 0
    )
  })

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [filteredMessages.length])

  const handleSend = () => {
    if (!text.trim() || !currentChat) return

    sendMessage.mutate({
      text: text.trim(),
      destination_id: currentChat.type === 'dm' ? currentChat.nodeId : undefined,
      channel_index: currentChat.type === 'channel' ? currentChat.index : 0,
    })

    setText('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (!status.connected) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <p className="text-lg mb-2">Not connected</p>
          <p className="text-sm">Connect to a Meshtastic node to start chatting</p>
        </div>
      </div>
    )
  }

  if (!currentChat) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <p className="text-lg mb-2">Select a channel or node</p>
          <p className="text-sm">Choose from the sidebar to start messaging</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col h-full">
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
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        {filteredMessages.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            No messages yet. Start the conversation!
          </div>
        ) : (
          filteredMessages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))
        )}
      </ScrollArea>

      {/* Input */}
      <div className="p-4 border-t border-border bg-card/50">
        <div className="flex gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${currentChat.name}...`}
            className="flex-1"
          />
          <Button
            onClick={handleSend}
            disabled={!text.trim() || sendMessage.isPending}
            size="icon"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
