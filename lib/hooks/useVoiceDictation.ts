'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// Shared voice-dictation hook used by the article editor chat, the newsletter
// chat, and the Чистый лист draft textarea + discussion panel. Centralises:
//  • continuous recognition (user dictates multiple sentences without silence
//    killing the stream)
//  • live interim text — exposed via `interim` so callers can render
//    "• слышу: текущая фраза..." under the mic while the model is still
//    hearing the speaker
//  • final segments flow through `onFinal` — caller decides where to append
//  • unified error handling with human-readable alerts; no silent failures
//
// Kept in a hook (not a utility) because SpeechRecognition is tied to the
// component lifecycle: on unmount we stop the stream to release the mic.

interface Options {
  /** BCP 47 language tag, default `ru-RU`. */
  lang?: string
  /** Called once per finalized segment with just the new transcript. */
  onFinal: (text: string) => void
}

export interface VoiceDictationApi {
  /** Mic is currently open and listening. */
  listening: boolean
  /** Current interim transcript from the in-flight utterance, '' when idle. */
  interim: string
  /** Toggle listening on/off. */
  toggle: () => void
  /** Force-start (no-op if already listening). */
  start: () => void
  /** Force-stop. */
  stop: () => void
  /** True when the browser exposes a SpeechRecognition implementation. */
  available: boolean
}

export function useVoiceDictation({ lang = 'ru-RU', onFinal }: Options): VoiceDictationApi {
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const recognitionRef = useRef<any>(null)
  // Keep the latest onFinal in a ref so we don't have to tear down the
  // recognition instance when the caller's callback closure changes.
  const onFinalRef = useRef(onFinal)
  useEffect(() => { onFinalRef.current = onFinal }, [onFinal])

  const available = typeof window !== 'undefined'
    && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)

  const stop = useCallback(() => {
    try { recognitionRef.current?.stop() } catch { /* already stopped */ }
    setListening(false)
    setInterim('')
  }, [])

  const start = useCallback(() => {
    if (listening) return
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      alert('Голосовой ввод не поддерживается этим браузером. Попробуй Chrome или Safari.')
      return
    }
    const recognition = new SR()
    recognition.lang = lang
    recognition.continuous = true
    recognition.interimResults = true

    recognition.onresult = (event: any) => {
      let interimBuffer = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const segment = event.results[i]
        const transcript: string = segment[0]?.transcript ?? ''
        if (segment.isFinal) {
          // Commit final segments upstream immediately; the caller appends
          // them to its own input/textarea state.
          if (transcript.trim()) onFinalRef.current(transcript.trim())
        } else {
          interimBuffer += transcript
        }
      }
      setInterim(interimBuffer)
    }

    recognition.onerror = (event: any) => {
      setListening(false)
      setInterim('')
      const reason: string = event?.error || 'unknown'
      // 'no-speech' happens on short silence with continuous mode — harmless.
      // 'aborted' fires when we call stop() ourselves.
      if (reason === 'no-speech' || reason === 'aborted') return
      const msg: Record<string, string> = {
        'not-allowed': 'Браузер запретил доступ к микрофону. Разреши в настройках и попробуй снова.',
        'service-not-allowed': 'Сервис распознавания недоступен (нужен HTTPS и разрешение на микрофон).',
        'audio-capture': 'Микрофон не найден.',
        'network': 'Нет интернета для распознавания речи.',
      }
      alert('Голосовой ввод: ' + (msg[reason] ?? reason))
    }

    recognition.onend = () => {
      setListening(false)
      setInterim('')
    }

    recognitionRef.current = recognition
    try {
      recognition.start()
      setListening(true)
    } catch (err) {
      setListening(false)
      alert('Не удалось запустить распознавание: ' + (err instanceof Error ? err.message : String(err)))
    }
  }, [lang, listening])

  const toggle = useCallback(() => {
    if (listening) stop()
    else start()
  }, [listening, start, stop])

  // On unmount: release the mic so it doesn't keep listening after the
  // component tree leaves the page.
  useEffect(() => {
    return () => {
      try { recognitionRef.current?.stop() } catch { /* ignore */ }
    }
  }, [])

  return { listening, interim, toggle, start, stop, available: Boolean(available) }
}
