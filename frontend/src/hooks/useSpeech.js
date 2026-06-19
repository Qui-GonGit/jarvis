import { useCallback, useEffect, useRef, useState } from 'react'

const SpeechRecognitionImpl =
  typeof window !== 'undefined'
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null

export function useSpeech({ onResult, onSpeakStart, lang = 'it-IT' } = {}) {
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [supported] = useState(() => Boolean(SpeechRecognitionImpl))
  const [error, setError] = useState(null)
  const recognitionRef = useRef(null)
  const onResultRef = useRef(onResult)
  onResultRef.current = onResult
  const onSpeakStartRef = useRef(onSpeakStart)
  onSpeakStartRef.current = onSpeakStart
  const audioRef = useRef(null)

  useEffect(() => {
    if (!SpeechRecognitionImpl) return

    const recognition = new SpeechRecognitionImpl()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = lang

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join(' ')
      onResultRef.current?.(transcript)
    }

    recognition.onerror = (event) => {
      setError(event.error)
      setIsListening(false)
    }

    recognition.onend = () => setIsListening(false)

    recognitionRef.current = recognition
    return () => recognition.abort()
  }, [lang])

  const startListening = useCallback(() => {
    if (!recognitionRef.current || isListening) return
    setError(null)
    try {
      recognitionRef.current.start()
      setIsListening(true)
    } catch {
      // already started, ignore
    }
  }, [isListening])

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
    setIsListening(false)
  }, [])

  const speakWithBrowser = useCallback((text) => {
    if (!('speechSynthesis' in window) || !text) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = lang
    utterance.onstart = () => {
      setIsSpeaking(true)
      onSpeakStartRef.current?.()
    }
    utterance.onend = () => setIsSpeaking(false)
    utterance.onerror = () => setIsSpeaking(false)
    window.speechSynthesis.speak(utterance)
  }, [lang])

  const speak = useCallback(async (text) => {
    if (!text) return
    audioRef.current?.pause()
    window.speechSynthesis?.cancel()

    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onplay = () => {
        setIsSpeaking(true)
        onSpeakStartRef.current?.()
      }
      audio.onended = () => {
        setIsSpeaking(false)
        URL.revokeObjectURL(url)
      }
      audio.onerror = () => {
        setIsSpeaking(false)
        URL.revokeObjectURL(url)
      }
      await audio.play()
    } catch {
      speakWithBrowser(text)
    }
  }, [speakWithBrowser])

  const cancelSpeaking = useCallback(() => {
    audioRef.current?.pause()
    window.speechSynthesis?.cancel()
    setIsSpeaking(false)
  }, [])

  return {
    supported,
    isListening,
    isSpeaking,
    error,
    startListening,
    stopListening,
    speak,
    cancelSpeaking,
  }
}
