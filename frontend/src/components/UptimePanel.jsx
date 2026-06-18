import { useEffect, useState } from 'react'
import { Panel, ProgressBar, Stat } from './Panel'

function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000)
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0')
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0')
  const s = String(totalSeconds % 60).padStart(2, '0')
  return `${h}:${m}:${s}`
}

export function UptimePanel({ startTime, commandCount, cpuPercent }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setElapsed(Date.now() - startTime), 1000)
    return () => clearInterval(id)
  }, [startTime])

  const load = cpuPercent ?? 0
  const loadLabel = load < 40 ? 'Low' : load < 75 ? 'Moderate' : 'High'

  return (
    <Panel
      title="System Uptime"
      action={<span className="font-mono text-xs text-cyan-500/50">{formatDuration(elapsed)}</span>}
    >
      <div className="space-y-3">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-cyan-500/50">
            System Running For:
          </div>
          <div className="font-mono text-lg text-cyan-50">{formatDuration(elapsed)}</div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Session" value="1" />
          <Stat label="Commands" value={commandCount} />
        </div>
        <div>
          <div className="mb-1 flex justify-between text-xs text-cyan-300/70">
            <span>System Load</span>
            <span>{loadLabel}</span>
          </div>
          <ProgressBar value={load} color="bg-amber-400" />
        </div>
      </div>
    </Panel>
  )
}
