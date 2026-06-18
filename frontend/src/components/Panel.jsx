export function Panel({ icon, title, action, children }) {
  return (
    <div className="rounded-md border border-cyan-500/20 bg-[#081627]/70 p-4 shadow-[0_0_20px_-4px_rgba(56,189,248,0.15)]">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-cyan-200">
          <span className="inline-block h-3 w-1 bg-cyan-400/80" />
          <span>{title}</span>
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

export function ProgressBar({ value, color = 'bg-cyan-400' }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-cyan-950/60">
      <div
        className={`h-full ${color} shadow-[0_0_8px_rgba(56,189,248,0.6)] transition-all`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}

export function Stat({ label, value }) {
  return (
    <div className="rounded-sm border border-cyan-500/10 bg-cyan-950/30 px-3 py-2 text-center">
      <div className="text-[10px] uppercase tracking-wide text-cyan-400/70">{label}</div>
      <div className="text-sm font-semibold text-cyan-50">{value}</div>
    </div>
  )
}
