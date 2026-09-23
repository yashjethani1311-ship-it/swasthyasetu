import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Mic, MicOff, AlertCircle } from 'lucide-react'

interface VoiceInputButtonProps {
  onTranscript: (text: string) => void
  currentValue?: string
  language?: 'English' | 'Hindi' | string
  className?: string
  size?: 'sm' | 'md'
  disabled?: boolean
  title?: string
  placeholder?: string
}

export function VoiceInputButton({
  onTranscript,
  currentValue = '',
  language = 'English',
  className = '',
  size = 'md',
  disabled = false,
  title,
}: VoiceInputButtonProps) {
  const [isListening, setIsListening] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [isSupported, setIsSupported] = useState(true)
  const recognitionRef = useRef<any>(null)
  const isMountedRef = useRef(true)

  const isHindi = language === 'Hindi'
  const langCode = isHindi ? 'hi-IN' : 'en-IN'

  useEffect(() => {
    isMountedRef.current = true
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      setIsSupported(false)
    }
    return () => {
      isMountedRef.current = false
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort()
        } catch {}
      }
    }
  }, [])

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch {}
    }
    setIsListening(false)
  }, [])

  const startListening = useCallback(() => {
    setErrorMsg('')
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

    if (!SpeechRecognition) {
      setIsSupported(false)
      setErrorMsg(
        isHindi
          ? 'इस ब्राउज़र में आवाज़ पहचानने की सुविधा उपलब्ध नहीं है।'
          : 'Speech recognition is not supported in this browser.'
      )
      return
    }

    try {
      const recognition = new SpeechRecognition()
      recognition.lang = langCode
      recognition.continuous = false
      recognition.interimResults = true
      recognition.maxAlternatives = 1

      let finalTranscript = ''

      recognition.onstart = () => {
        if (isMountedRef.current) {
          setIsListening(true)
          setErrorMsg('')
        }
      }

      recognition.onresult = (event: any) => {
        let interim = ''
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcriptPiece = event.results[i][0]?.transcript || ''
          if (event.results[i].isFinal) {
            finalTranscript += transcriptPiece
          } else {
            interim += transcriptPiece
          }
        }

        const spoken = (finalTranscript || interim).trim()
        if (spoken && isMountedRef.current) {
          const separator = currentValue && !currentValue.endsWith(' ') ? ' ' : ''
          const updated = currentValue ? `${currentValue}${separator}${spoken}` : spoken
          onTranscript(updated)
        }
      }

      recognition.onerror = (event: any) => {
        if (!isMountedRef.current) return
        setIsListening(false)
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          setErrorMsg(
            isHindi
              ? 'माइक्रोफ़ोन की अनुमति अस्वीकृत। कृपया ब्राउज़र में अनुमति दें।'
              : 'Microphone access denied. Please grant permission.'
          )
        } else if (event.error !== 'no-speech') {
          setErrorMsg(
            isHindi
              ? 'आवाज़ रिकॉर्ड करने में त्रुटि हुई।'
              : 'Speech recognition error. Please try again.'
          )
        }
      }

      recognition.onend = () => {
        if (isMountedRef.current) {
          setIsListening(false)
        }
      }

      recognitionRef.current = recognition
      recognition.start()
    } catch (err) {
      console.warn('SpeechRecognition start failed:', err)
      if (isMountedRef.current) {
        setIsListening(false)
        setErrorMsg(
          isHindi
            ? 'माइक्रोफ़ोन शुरू नहीं हो सका।'
            : 'Could not initialize microphone.'
        )
      }
    }
  }, [langCode, isHindi, currentValue, onTranscript])

  const toggleListening = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.preventDefault()
    if (isListening) {
      stopListening()
    } else {
      startListening()
    }
  }

  const defaultTitle = isListening
    ? isHindi
      ? 'सुनना बंद करें'
      : 'Stop listening'
    : isHindi
    ? 'बोलकर लिखें (माइक्रोफ़ोन)'
    : 'Dictate with voice'

  const btnSizeClass = size === 'sm' ? 'p-1.5 text-xs' : 'p-2 text-sm'
  const iconSize = size === 'sm' ? 'size-3.5' : 'size-4'

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        disabled={disabled || !isSupported}
        onClick={toggleListening}
        aria-label={title || defaultTitle}
        title={title || defaultTitle}
        aria-pressed={isListening}
        className={`rounded-lg transition-colors focus:outline-hidden focus:ring-2 focus:ring-primary/40 ${btnSizeClass} ${
          isListening
            ? 'bg-destructive/15 text-destructive animate-pulse border border-destructive/40 shadow-xs'
            : !isSupported
            ? 'opacity-40 cursor-not-allowed text-muted-foreground'
            : 'text-muted-foreground hover:bg-surface-subtle hover:text-foreground active:scale-95'
        } ${className}`}
      >
        {isListening ? (
          <Mic className={`${iconSize} text-destructive`} />
        ) : !isSupported ? (
          <MicOff className={iconSize} />
        ) : (
          <Mic className={iconSize} />
        )}
      </button>

      {errorMsg && (
        <div
          role="alert"
          className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 whitespace-nowrap z-50 rounded-md bg-destructive px-2 py-1 text-[11px] text-destructive-foreground shadow-md flex items-center gap-1"
        >
          <AlertCircle className="size-3 shrink-0" />
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={() => setErrorMsg('')}
            className="ml-1 text-xs opacity-75 hover:opacity-100"
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}
