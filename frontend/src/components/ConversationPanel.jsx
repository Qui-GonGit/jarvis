import { useEffect, useRef } from 'react'

export function ConversationPanel({ messages }) {
  const scrollRef = useRef(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-cyan-500/20 px-4 py-3">
        <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-cyan-200">
          <span className="inline-block h-3 w-1 bg-cyan-400/80" />
          Conversation
        </span>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-1 overflow-y-auto px-4 py-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className="flex items-baseline gap-2 overflow-hidden whitespace-nowrap font-mono text-[11px]"
          >
            <span className="shrink-0 text-cyan-500/60">{msg.time}</span>
            <span className="shrink-0 text-cyan-200">
              {msg.role === 'user' ? 'domanda' : 'risposta'}
            </span>
            <span className="shrink-0 text-cyan-500/40">·</span>
            <span className="overflow-hidden text-ellipsis text-cyan-300/80">{msg.content}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
