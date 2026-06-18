import { useCallback, useRef } from 'react'

const START_SECONDS = 10
const DURATION_SECONDS = 50
const VOLUME = 0.22
const FADE_IN_MS = 3000
const FADE_OUT_MS = 2000

function rampVolume(audio, from, to, durationMs, onDone) {
  const steps = 20
  const stepMs = durationMs / steps
  let i = 0
  const interval = setInterval(() => {
    i += 1
    audio.volume = Math.max(0, Math.min(1, from + (to - from) * (i / steps)))
    if (i >= steps) {
      clearInterval(interval)
      onDone?.()
    }
  }, stepMs)
  return interval
}

export function useIntroMusic(src = '/intro.mp3') {
  const audioRef = useRef(null)
  const timersRef = useRef([])

  const play = useCallback(() => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
    audioRef.current?.pause()

    const audio = new Audio(src)
    audio.volume = 0
    audioRef.current = audio

    const begin = () => {
      audio.currentTime = START_SECONDS
      audio.play().catch(() => {})
      rampVolume(audio, 0, VOLUME, FADE_IN_MS)

      const fadeOutTimer = setTimeout(() => {
        rampVolume(audio, VOLUME, 0, FADE_OUT_MS, () => audio.pause())
      }, DURATION_SECONDS * 1000 - FADE_OUT_MS)

      timersRef.current.push(fadeOutTimer)
    }

    if (audio.readyState >= 1) begin()
    else audio.addEventListener('loadedmetadata', begin, { once: true })
  }, [src])

  return { play }
}
