import { useEffect, useRef, useState } from 'react'
import { DownloadIcon, MicIcon, SendIcon, TrashIcon } from './icons'

export function ConversationPanel({
  messages,
  onSend,
  onClear,
  onExtract,
  isListening,
  onMicClick,
  micSupported,
  inputRef,
}) {
  const [draft, setDraft] = useState('')
  const scrollRef = useRef(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  function handleSubmit(e) {
    e.preventDefault()
    if (!draft.trim()) return
    onSend(draft.trim())
    setDraft('')
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-cyan-500/20 px-4 py-3">
        <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-cyan-200">
          <span className="inline-block h-3 w-1 bg-cyan-400/80" />
          Conversation
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClear}
            className="flex items-center gap-1.5 rounded-sm border border-cyan-500/20 px-2.5 py-1 text-xs text-cyan-300/80 hover:text-cyan-100"
          >
            <TrashIcon /> Clear
          </button>
          <button
            type="button"
            onClick={onExtract}
            className="flex items-center gap-1.5 rounded-sm border border-cyan-500/20 px-2.5 py-1 text-xs text-cyan-300/80 hover:text-cyan-100"
          >
            <DownloadIcon /> Extract Conversation
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`max-w-[80%] rounded-md px-4 py-2.5 text-sm ${
              msg.role === 'assistant'
                ? 'border border-cyan-500/10 bg-[#081627]/80 text-cyan-50'
                : 'ml-auto border border-cyan-500/30 bg-cyan-500/10 text-cyan-50'
            }`}
          >
            <p className="whitespace-pre-wrap">{msg.content}</p>
            <span className="mt-1 block text-[10px] text-cyan-500/50">{msg.time}</span>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-cyan-500/20 p-3">
        <button
          type="button"
          onClick={onMicClick}
          disabled={!micSupported}
          aria-label="Toggle microphone"
          className={`rounded-full border border-cyan-500/20 p-2.5 ${
            isListening ? 'text-red-400' : 'text-cyan-300/70'
          } hover:text-cyan-100 disabled:opacity-40`}
        >
          <MicIcon />
        </button>
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 rounded-sm border border-cyan-500/20 bg-[#040c18] px-3 py-2.5 text-sm text-cyan-50 outline-none placeholder:text-cyan-500/40 focus:border-cyan-400/50"
        />
        <button
          type="submit"
          aria-label="Send message"
          className="rounded-sm bg-cyan-500/20 p-2.5 text-cyan-300 hover:bg-cyan-500/30"
        >
          <SendIcon />
        </button>
      </form>
    </div>
  )
}
