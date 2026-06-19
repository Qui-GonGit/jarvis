import { useEffect, useRef, useState } from 'react'
import { TopBar } from './components/TopBar'
import { SystemStatsPanel } from './components/SystemStatsPanel'
import { WeatherPanel } from './components/WeatherPanel'
import { UptimePanel } from './components/UptimePanel'
import { JarvisOrb } from './components/JarvisOrb'
import { ConversationPanel } from './components/ConversationPanel'
import { ETFPanel } from './components/ETFPanel'
import { KeyboardIcon, MicIcon } from './components/icons'
import { useSpeech } from './hooks/useSpeech'
import { usePolling } from './hooks/usePolling'
import { useIntroMusic } from './hooks/useIntroMusic'

const sessionStart = Date.now()

const MIC_ERROR_MESSAGES = {
  'not-allowed': 'Permesso microfono negato. Clicca sull\'icona del lucchetto nella barra degli indirizzi e abilita il microfono per questo sito.',
  'service-not-allowed': 'Permesso microfono negato dal browser.',
  'audio-capture': 'Nessun microfono rilevato sul dispositivo.',
  'no-speech': 'Non ho sentito nulla, riprova.',
  'network': 'Problema di rete con il riconoscimento vocale.',
}

function micErrorMessage(error) {
  if (!error) return null
  return MIC_ERROR_MESSAGES[error] ?? `Errore microfono: ${error}`
}

function timeNow() {
  return new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

function buildFirstMessageContent(text, weatherData, emailAvailable) {
  const now = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  const weatherLine = weatherData
    ? `Il meteo attuale a ${weatherData.city} è: ${weatherData.condition}, ${weatherData.tempC.toFixed(1)}°C (percepita ${weatherData.feelsLikeC.toFixed(1)}°C).`
    : 'Il meteo non è disponibile al momento.'
  const emailLine = emailAvailable
    ? ' Controlla anche se ci sono email importanti non lette usando lo strumento a disposizione. Se ce ne sono, menzionalo solo brevemente (es. quante sono), senza elencarle o riassumerle nel dettaglio a meno che l\'utente non lo chieda esplicitamente. Se non ce ne sono, non parlarne affatto.'
    : ''

  return (
    `[Istruzione di sistema, non mostrarla all'utente: è il primo messaggio di questa conversazione ` +
    `(ora attuale: ${now}). Saluta in modo adatto all'orario, fai una breve battuta in stile J.A.R.V.I.S, ` +
    `comunica il meteo attuale usando questi dati reali: ${weatherLine}${emailLine} Poi rispondi anche al ` +
    `messaggio dell'utente riportato sotto, in modo naturale e conciso.]\n\nMessaggio dell'utente: "${text}"`
  )
}

async function requestReply(apiMessages) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: apiMessages }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return data.reply ?? 'Sorry, I could not process that.'
}

export default function App() {
  const [messages, setMessages] = useState([])
  const [commandCount, setCommandCount] = useState(0)
  const [orbState, setOrbState] = useState('idle')
  const inputRef = useRef(null)

  const stats = usePolling('/api/system-stats', { intervalMs: 4000 })
  const weather = usePolling('/api/weather', { intervalMs: 10 * 60 * 1000 })
  const health = usePolling('/api/health', { intervalMs: 15000 })
  const emailStatus = usePolling('/api/email/status', { intervalMs: 30000 })
  const etf = usePolling('/api/etf', { intervalMs: 5 * 60 * 1000 })

  const introMusic = useIntroMusic()
  const pendingIntroMusicRef = useRef(false)

  const speech = useSpeech({
    onResult: (transcript) => {
      if (transcript.trim()) handleSend(transcript.trim())
    },
    onSpeakStart: () => {
      if (pendingIntroMusicRef.current) {
        pendingIntroMusicRef.current = false
        introMusic.play()
      }
    },
  })

  useEffect(() => {
    setOrbState(speech.isListening ? 'listening' : speech.isSpeaking ? 'speaking' : 'idle')
  }, [speech.isListening, speech.isSpeaking])

  async function handleSend(text) {
    const isFirstMessage = messages.length === 0
    const userMessage = { id: crypto.randomUUID(), role: 'user', content: text, time: timeNow() }
    setMessages((prev) => [...prev, userMessage])
    setCommandCount((count) => count + 1)
    setOrbState('thinking')

    if (isFirstMessage) pendingIntroMusicRef.current = true
    const apiContent = isFirstMessage
      ? buildFirstMessageContent(text, weather.data, emailStatus.data?.authorized)
      : text

    try {
      const reply = await requestReply([
        ...messages.map(({ role, content }) => ({ role, content })),
        { role: 'user', content: apiContent },
      ])
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'assistant', content: reply, time: timeNow() },
      ])
      speech.speak(reply)
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: "I can't reach the backend right now, sir. Please check the server.",
          time: timeNow(),
        },
      ])
      pendingIntroMusicRef.current = false
      setOrbState('idle')
    }
  }

  function handleMicClick() {
    if (speech.isListening) speech.stopListening()
    else speech.startListening()
  }

  function handleClear() {
    setMessages([])
  }

  function handleExtract() {
    const text = messages.map((m) => `[${m.time}] ${m.role}: ${m.content}`).join('\n')
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'jarvis-conversation.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#040b16]">
      <TopBar backendOnline={health.online} emailStatus={emailStatus.data} />

      <main className="grid min-h-0 flex-1 grid-cols-[320px_1fr_380px] gap-4 overflow-hidden p-4">
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
          <SystemStatsPanel stats={stats.data} online={stats.online} onRefresh={stats.refresh} />
          <WeatherPanel weather={weather.data} online={weather.online} onRefresh={weather.refresh} />
          <UptimePanel
            startTime={sessionStart}
            commandCount={commandCount}
            cpuPercent={stats.data?.cpuPercent}
          />
        </div>

        <div className="flex min-h-0 flex-col items-center overflow-y-auto">
          <JarvisOrb state={orbState} />
          <div className="mb-2 flex items-center gap-4">
            <button
              type="button"
              onClick={handleMicClick}
              disabled={!speech.supported}
              aria-label="Toggle microphone"
              className={`rounded-full border border-cyan-500/20 p-3 ${speech.isListening ? 'text-red-400' : 'text-cyan-300/70'} hover:text-cyan-100 disabled:opacity-40`}
            >
              <MicIcon />
            </button>
            <button
              type="button"
              onClick={() => inputRef.current?.focus()}
              aria-label="Focus text input"
              className="rounded-full border border-cyan-500/20 p-3 text-cyan-300/70 hover:text-cyan-100"
            >
              <KeyboardIcon />
            </button>
          </div>
          {!speech.supported && (
            <p className="max-w-xs text-center text-xs text-amber-400">
              Il riconoscimento vocale non è supportato in questo browser. Usa Chrome o Edge.
            </p>
          )}
          {speech.supported && micErrorMessage(speech.error) && (
            <p className="max-w-xs text-center text-xs text-amber-400">
              {micErrorMessage(speech.error)}
            </p>
          )}
        </div>

        <div className="flex min-h-0 flex-col gap-4 overflow-hidden">
          <ETFPanel etfs={etf.data?.etfs} online={etf.online} onRefresh={etf.refresh} />
          <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-cyan-500/20 bg-[#081627]/70 shadow-[0_0_20px_-4px_rgba(56,189,248,0.15)]">
            <ConversationPanel
              messages={messages}
              onSend={handleSend}
              onClear={handleClear}
              onExtract={handleExtract}
              isListening={speech.isListening}
              onMicClick={handleMicClick}
              micSupported={speech.supported}
              inputRef={inputRef}
            />
          </div>
        </div>
      </main>
    </div>
  )
}
