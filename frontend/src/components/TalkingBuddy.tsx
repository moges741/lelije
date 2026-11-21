import { useEffect, useState, type ReactNode } from 'react'
import { useApp } from '../context/app-context'
import {
  isVoiceSupported,
  readVoiceAutoPref,
  saveVoiceAutoPref,
  speakText,
  stopSpeaking,
} from '../lib/voice'
import { EditorialMedia } from './EditorialMedia'
import { Icon } from './Icon'

const LABELS = {
  en: {
    name: 'Zema',
    listen: 'Listen',
    stop: 'Stop',
    voiceOn: 'Auto-voice on',
    voiceOff: 'Auto-voice off',
  },
  am: {
    name: 'ዜማ',
    listen: 'አዳምጥ',
    stop: 'አቁም',
    voiceOn: 'ድምፅ በርቷል',
    voiceOff: 'ድምፅ ጠፍቷል',
  },
  om: {
    name: 'Zemaa',
    listen: 'Dhaggeeffadhu',
    stop: 'Dhaabi',
    voiceOn: 'Sagaleen banaadha',
    voiceOff: 'Sagaleen cufaadha',
  },
} as const

/**
 * Warm illustrated talking companion for children (ages 5–13).
 * Gives short conversational guidance with one-tap read-aloud audio.
 */
export function TalkingBuddy({
  message,
  spokenText,
  showAutoToggle = false,
  action,
}: {
  message: string
  spokenText?: string
  showAutoToggle?: boolean
  action?: ReactNode
}) {
  const { language } = useApp()
  const [speaking, setSpeaking] = useState(false)
  const [autoVoice, setAutoVoice] = useState(readVoiceAutoPref)
  const copy = LABELS[language] ?? LABELS.en
  const supported = isVoiceSupported()
  const toSpeak = spokenText ?? message

  useEffect(() => {
    if (!autoVoice || !supported || !toSpeak.trim()) return
    speakText(toSpeak, language, {
      onStart: () => setSpeaking(true),
      onEnd: () => setSpeaking(false),
    })
    return () => {
      stopSpeaking()
      setSpeaking(false)
    }
  }, [autoVoice, language, supported, toSpeak])

  useEffect(() => () => stopSpeaking(), [])

  const toggleSpeak = () => {
    if (speaking) {
      stopSpeaking()
      setSpeaking(false)
      return
    }
    speakText(toSpeak, language, {
      onStart: () => setSpeaking(true),
      onEnd: () => setSpeaking(false),
    })
  }

  const toggleAuto = () => {
    const next = !autoVoice
    setAutoVoice(next)
    saveVoiceAutoPref(next)
    if (!next) {
      stopSpeaking()
      setSpeaking(false)
    }
  }

  return (
    <section className={`buddy-card ${speaking ? 'is-speaking' : ''}`} aria-live="polite">
      <div className="buddy-avatar-wrap">
        <EditorialMedia
          src="/images/zema_guide.jpg"
          alt={copy.name}
          className="buddy-avatar"
          fallbackIcon="star"
          fallbackTone="light"
        />
      </div>

      <div className="buddy-content">
        <p className="buddy-text">{message}</p>
        <div className="buddy-controls">
          {supported && (
            <button
              type="button"
              className={speaking ? 'buddy-voice-btn is-active' : 'buddy-voice-btn'}
              onClick={toggleSpeak}
            >
              <Icon name={speaking ? 'volumeOff' : 'volume'} size={18} />
              <span>{speaking ? copy.stop : copy.listen}</span>
            </button>
          )}
          {supported && showAutoToggle && (
            <button
              type="button"
              className={autoVoice ? 'buddy-auto-btn is-on' : 'buddy-auto-btn'}
              aria-pressed={autoVoice}
              onClick={toggleAuto}
            >
              <span>{autoVoice ? copy.voiceOn : copy.voiceOff}</span>
            </button>
          )}
          {action}
        </div>
      </div>
    </section>
  )
}
