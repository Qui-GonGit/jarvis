import { useEffect, useState } from 'react'
import { GearIcon } from './icons'

export function TopBar({ backendOnline, emailStatus }) {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const time = now.toLocaleTimeString('it-IT', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  async function connectGmail() {
    const res = await fetch('/api/email/auth-url')
    if (!res.ok) return
    const { url } = await res.json()
    window.open(url, '_blank')
  }

  return (
    <header className="flex items-center justify-between border-b border-cyan-500/20 bg-[#040c18]/80 px-5 py-3">
      <div className="flex items-baseline gap-3">
        <span className="flex items-center gap-2 text-lg font-semibold tracking-[0.2em] text-cyan-50">
          <span className="inline-block size-2.5 rotate-45 bg-cyan-400 shadow-[0_0_8px_rgba(56,189,248,0.9)]" />
          J.A.R.V.I.S
        </span>
        <span className="hidden text-[10px] uppercase tracking-[0.15em] text-cyan-500/50 sm:inline">
          Just A Rather Very Intelligent System · Personal Assistant
        </span>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-cyan-200">
          <span
            className={`size-2 rounded-full ${backendOnline ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]' : 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.9)]'}`}
          />
          <span className="font-mono">{time}</span>
          <span className="text-cyan-500/30">|</span>
          <span>{backendOnline ? 'Sistemi Online' : 'Sistemi Offline'}</span>
        </div>
        {emailStatus?.configured && !emailStatus?.authorized && (
          <button
            type="button"
            onClick={connectGmail}
            className="rounded-sm border border-cyan-500/20 px-2.5 py-1.5 text-xs uppercase tracking-wider text-cyan-300/80 hover:text-cyan-100"
          >
            Connetti Gmail
          </button>
        )}
        <button
          type="button"
          aria-label="Settings"
          className="rounded-sm border border-cyan-500/20 p-1.5 text-cyan-500/60 hover:text-cyan-200"
        >
          <GearIcon />
        </button>
      </div>
    </header>
  )
}
