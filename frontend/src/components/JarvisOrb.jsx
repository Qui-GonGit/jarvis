export function JarvisOrb({ state }) {
  const statusLabel = {
    listening: 'In ascolto…',
    speaking: 'Sto parlando…',
    thinking: 'Sto elaborando…',
    idle: 'In attesa…',
  }[state]

  const active = state === 'listening' || state === 'speaking' || state === 'thinking'
  const pulseDuration = active ? '1.1s' : '2.8s'

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8">
      <div className="relative flex size-80 items-center justify-center">
        <div className="absolute inset-0 rounded-full border border-cyan-500/15" />
        <div className="absolute inset-6 rounded-full border border-cyan-500/20" />

        <div
          className="absolute inset-0 rounded-full bg-[radial-gradient(circle,_#67e8f9_1px,_transparent_1.4px)] [background-size:14px_14px] [mask-image:radial-gradient(circle,transparent_15%,rgba(0,0,0,0.45)_55%,black_85%,black_100%)]"
          style={{ animation: `jarvis-spin ${active ? '14s' : '26s'} linear infinite` }}
        />
        <div
          className="absolute inset-0 rounded-full bg-[radial-gradient(circle,_#a5f3fc_1px,_transparent_1.3px)] [background-size:7px_7px] [mask-image:radial-gradient(circle,transparent_78%,black_92%,black_100%)]"
          style={{ animation: `jarvis-spin ${active ? '20s' : '36s'} linear infinite reverse` }}
        />

        <div
          className="absolute -inset-3 rounded-full border-[1.5px] border-cyan-300/60 [mask-image:conic-gradient(from_0deg,transparent_0%,black_6%,black_24%,transparent_32%,transparent_100%)]"
          style={{ animation: `jarvis-spin ${active ? '1.6s' : '2.4s'} linear infinite` }}
        />

        <div
          className="absolute size-16 rounded-full bg-cyan-300/90 blur-xl"
          style={{ animation: `jarvis-core-pulse ${pulseDuration} ease-in-out infinite` }}
        />
        <div
          className="absolute size-6 rounded-full bg-white shadow-[0_0_25px_8px_rgba(125,211,252,0.8)]"
          style={{ animation: `jarvis-core-pulse ${pulseDuration} ease-in-out infinite` }}
        />
      </div>

      <div className="text-center">
        <div className="text-xl font-semibold tracking-[0.2em] text-cyan-50">J.A.R.V.I.S</div>
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-sm border border-cyan-500/20 px-3 py-1 text-xs uppercase tracking-wider text-cyan-300/80">
          <span className={`size-1.5 rounded-full ${active ? 'bg-cyan-400' : 'bg-cyan-500/40'}`} />
          {statusLabel}
        </div>
      </div>
    </div>
  )
}
