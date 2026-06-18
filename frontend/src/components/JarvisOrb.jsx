function generateSphereDots() {
  const dots = []
  const steps = 16
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      const x = (i / steps) * 2 - 1
      const y = (j / steps) * 2 - 1
      const r = Math.sqrt(x * x + y * y)
      if (r > 1) continue
      const angle = Math.atan2(y, x)
      // Warp radius so points bunch up near the rim, like latitude lines
      // compressing near the limb of a sphere seen in orthographic projection.
      const rWarped = Math.sin((r * Math.PI) / 2)
      dots.push({ x: rWarped * Math.cos(angle), y: rWarped * Math.sin(angle) })
    }
  }
  return dots
}

const SPHERE_DOTS = generateSphereDots()

export function JarvisOrb({ state }) {
  const statusLabel = {
    listening: 'In ascolto…',
    speaking: 'Sto parlando…',
    thinking: 'Sto elaborando…',
    idle: 'In attesa…',
  }[state]

  const active = state === 'listening' || state === 'speaking' || state === 'thinking'
  const voiceActive = state === 'listening' || state === 'speaking'
  const pulseDuration = active ? '1.1s' : '2.8s'

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8">
      <div className="relative flex size-80 items-center justify-center">
        <div className="absolute inset-0 rounded-full border border-cyan-500/15" />
        <div className="absolute inset-6 rounded-full border border-cyan-500/20" />

        <div className="absolute inset-0" style={{ perspective: '900px' }}>
          <div
            className="size-full"
            style={{ transform: 'rotateX(11deg) rotateY(16deg)', transformStyle: 'preserve-3d' }}
          >
            <div
              className="size-full"
              style={{ animation: voiceActive ? 'sphere-bounce 0.85s ease-in-out infinite' : 'none' }}
            >
              <svg
                viewBox="-50 -50 100 100"
                className="size-full"
                style={{ animation: `jarvis-spin ${active ? '18s' : '34s'} linear infinite` }}
              >
                {SPHERE_DOTS.map((d, idx) => (
                  <circle key={idx} cx={d.x * 46} cy={d.y * 46} r={0.85} fill="#7dd3fc" opacity={0.85} />
                ))}
              </svg>
            </div>
          </div>
        </div>

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
