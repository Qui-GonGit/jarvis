import { Panel } from './Panel'

function formatTokens(value) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  return String(value)
}

export function TokenUsagePanel({ usage, online }) {
  return (
    <Panel title="Token Anthropic">
      {!online || !usage ? (
        <p className="text-xs text-cyan-500/50">Backend offline — no live data.</p>
      ) : (
        <div className="space-y-1">
          <div className="text-lg font-semibold text-cyan-50">{formatTokens(usage.totalTokens)} token</div>
          <div className="text-xs text-cyan-500/60">
            {formatTokens(usage.inputTokens)} input · {formatTokens(usage.outputTokens)} output
          </div>
        </div>
      )}
    </Panel>
  )
}
