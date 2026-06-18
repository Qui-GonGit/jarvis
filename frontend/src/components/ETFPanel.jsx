import { Panel } from './Panel'
import { RefreshIcon } from './icons'

export function ETFPanel({ etfs, online, onRefresh }) {
  return (
    <Panel
      title="ETF"
      action={
        <button
          type="button"
          onClick={onRefresh}
          aria-label="Refresh ETF data"
          className="text-cyan-500/60 hover:text-cyan-200"
        >
          <RefreshIcon />
        </button>
      }
    >
      {!online || !etfs ? (
        <p className="text-xs text-cyan-500/50">Backend offline — no live data.</p>
      ) : (
        <div className="space-y-2">
          {etfs.map((etf) => (
            <div
              key={etf.ticker}
              className="flex items-center justify-between rounded-sm border border-cyan-500/10 bg-cyan-950/30 px-3 py-2"
            >
              <span className="text-xs font-medium uppercase tracking-wide text-cyan-200">
                {etf.ticker}
              </span>
              {etf.status === 'ok' ? (
                <div className="text-right">
                  <div className="text-sm font-semibold text-cyan-50">
                    {etf.price.toFixed(2)} {etf.currency}
                  </div>
                  {typeof etf.changePercent === 'number' && (
                    <div className={`text-xs ${etf.changePercent >= 0 ? 'text-cyan-300' : 'text-amber-400'}`}>
                      {etf.changePercent >= 0 ? '+' : ''}
                      {etf.changePercent.toFixed(2)}%
                    </div>
                  )}
                </div>
              ) : (
                <span className="text-xs text-cyan-500/40">n/d</span>
              )}
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}
