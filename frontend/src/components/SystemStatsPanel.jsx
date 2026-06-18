import { Panel, ProgressBar, Stat } from './Panel'
import { RefreshIcon } from './icons'

export function SystemStatsPanel({ stats, online, onRefresh }) {
  const cpu = stats?.cpuPercent ?? 0
  const ramPercent = stats?.ramPercent ?? 0
  const ramUsedGB = stats?.ramUsedGB ?? 0
  const diskUsedGB = stats?.diskUsedGB ?? 0
  const diskTotalGB = stats?.diskTotalGB ?? 0

  return (
    <Panel
      title="System Stats"
      action={
        <button
          type="button"
          onClick={onRefresh}
          aria-label="Refresh system stats"
          className="text-cyan-500/60 hover:text-cyan-200"
        >
          <RefreshIcon />
        </button>
      }
    >
      {!online ? (
        <p className="text-xs text-cyan-500/50">Backend offline — no live data.</p>
      ) : (
        <div className="space-y-3">
          <div>
            <div className="mb-1 flex justify-between text-xs text-cyan-300/70">
              <span>CPU Usage</span>
              <span>{cpu.toFixed(0)}%</span>
            </div>
            <ProgressBar value={cpu} />
          </div>
          <div>
            <div className="mb-1 flex justify-between text-xs text-cyan-300/70">
              <span>RAM Usage</span>
              <span>{ramUsedGB.toFixed(0)} GB</span>
            </div>
            <ProgressBar value={ramPercent} color="bg-violet-400" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="CPU" value={`${cpu.toFixed(0)}%`} />
            <Stat label="Memory" value={`${ramPercent.toFixed(0)}%`} />
            <Stat label="Disk" value={`${diskUsedGB.toFixed(0)}/${diskTotalGB.toFixed(0)} GB`} />
          </div>
        </div>
      )}
    </Panel>
  )
}
