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

const EQ_COLORS = {
  cyan: { active: 'bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.85)]', inactive: 'bg-cyan-500/15' },
  violet: { active: 'bg-violet-400 shadow-[0_0_6px_rgba(167,139,250,0.85)]', inactive: 'bg-violet-500/15' },
}

const EQ_BAR_COUNT = 14
const EQ_HEIGHT_SEED = [38, 68, 52, 84, 58, 96, 48, 74, 62, 90, 42, 78, 56, 70]

export function Equalizer({ value, color = 'cyan' }) {
  const c = EQ_COLORS[color] ?? EQ_COLORS.cyan
  const activeCount = Math.round((Math.min(100, Math.max(0, value)) / 100) * EQ_BAR_COUNT)

  return (
    <div className="flex h-9 items-end gap-[3px]">
      {Array.from({ length: EQ_BAR_COUNT }).map((_, i) => {
        const isActive = i < activeCount
        const height = isActive ? EQ_HEIGHT_SEED[i % EQ_HEIGHT_SEED.length] : 16
        return (
          <div
            key={i}
            className={`flex-1 origin-bottom rounded-[1px] transition-[height] duration-300 ${isActive ? c.active : c.inactive}`}
            style={{
              height: `${height}%`,
              animation: isActive
                ? `eq-pulse ${1 + (i % 5) * 0.15}s ease-in-out ${i * 0.05}s infinite`
                : 'none',
            }}
          />
        )
      })}
    </div>
  )
}

export function Thermometer({ tempC, min = -10, max = 45 }) {
  const value = tempC ?? 0
  const pct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100))
  const fillColor =
    value >= 28
      ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.7)]'
      : value <= 5
        ? 'bg-cyan-300 shadow-[0_0_8px_rgba(165,243,252,0.7)]'
        : 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.7)]'

  return (
    <div className="flex h-12 w-5 flex-col items-center">
      <div className="relative h-9 w-2 overflow-hidden rounded-full border border-cyan-500/30 bg-cyan-950/50">
        <div
          className={`absolute bottom-0 left-0 w-full transition-all duration-700 ${fillColor}`}
          style={{ height: `${pct}%` }}
        />
      </div>
      <div className={`-mt-0.5 size-3.5 rounded-full border border-cyan-500/30 ${fillColor}`} />
    </div>
  )
}
