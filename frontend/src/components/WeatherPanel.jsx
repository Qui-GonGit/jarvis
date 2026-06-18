import { Panel, Stat } from './Panel'
import { CloudIcon, RefreshIcon } from './icons'

export function WeatherPanel({ weather, online, onRefresh }) {
  return (
    <Panel
      title="Weather"
      action={
        <button
          type="button"
          onClick={onRefresh}
          aria-label="Refresh weather"
          className="text-cyan-500/60 hover:text-cyan-200"
        >
          <RefreshIcon />
        </button>
      }
    >
      {!online || !weather ? (
        <p className="text-xs text-cyan-500/50">Backend offline — no live data.</p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl font-semibold text-cyan-50">
                {weather.tempC.toFixed(1)}°C
              </div>
              <div className="text-xs text-cyan-300/70">
                {weather.city}, {weather.country}
              </div>
              <div className="text-xs text-cyan-500/50">{weather.condition}</div>
            </div>
            <CloudIcon className="size-10 text-cyan-500/40" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Humidity" value={`${weather.humidity}%`} />
            <Stat label="Wind" value={`${weather.windMs.toFixed(1)} m/s`} />
          </div>
          <Stat label="Feels Like" value={`${weather.feelsLikeC.toFixed(1)}°C`} />
        </div>
      )}
    </Panel>
  )
}
