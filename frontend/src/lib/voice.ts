import type { AppLanguage } from '../types/mission'

const VOICE_AUTO_KEY = 'lelije.voiceAuto.v1'

const LANG_CODES: Record<AppLanguage, string> = {
  en: 'en-US',
  am: 'am-ET',
  om: 'om-ET',
}

export function isVoiceSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'
}

export function readVoiceAutoPref(): boolean {
  try {
    return localStorage.getItem(VOICE_AUTO_KEY) === 'on'
  } catch {
    return false
  }
}

export function saveVoiceAutoPref(enabled: boolean): void {
  try {
    localStorage.setItem(VOICE_AUTO_KEY, enabled ? 'on' : 'off')
  } catch {
    // Ignore storage errors when blocked.
  }
}

export function stopSpeaking(): void {
  if (!isVoiceSupported()) return
  try {
    window.speechSynthesis.cancel()
  } catch {
    // Ignore synthesis cancellation errors.
  }
}

/**
 * Speaks a short friendly prompt using the browser's built-in speech engine.
 * Warm child-friendly pacing; safely silent if speech synthesis is unavailable.
 */
export function speakText(
  text: string,
  language: AppLanguage = 'en',
  callbacks?: { onStart?: () => void; onEnd?: () => void },
): void {
  if (!isVoiceSupported() || !text.trim()) {
    callbacks?.onEnd?.()
    return
  }

  try {
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text.trim())
    const targetLang = LANG_CODES[language] ?? 'en-US'
    utterance.lang = targetLang
    utterance.rate = 0.95
    utterance.pitch = 1.06

    const voices = window.speechSynthesis.getVoices()
    const exact = voices.find((v) => v.lang.toLowerCase() === targetLang.toLowerCase())
    const family = voices.find((v) => v.lang.toLowerCase().startsWith(language.toLowerCase()))
    const fallbackEn = voices.find((v) => v.lang.toLowerCase().startsWith('en'))
    if (exact) utterance.voice = exact
    else if (family) utterance.voice = family
    else if (fallbackEn) utterance.voice = fallbackEn

    utterance.onstart = () => callbacks?.onStart?.()
    utterance.onend = () => callbacks?.onEnd?.()
    utterance.onerror = () => callbacks?.onEnd?.()

    window.speechSynthesis.speak(utterance)
  } catch {
    callbacks?.onEnd?.()
  }
}
