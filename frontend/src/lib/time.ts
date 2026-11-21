import type { TranslationKey } from '../i18n'
import type { AppLanguage } from '../types/mission'

/** The server counts days in Addis Ababa time, so the app does too. */
const TIME_ZONE = 'Africa/Addis_Ababa'
const LOCALES: Record<AppLanguage, string> = { en: 'en', am: 'am-ET', om: 'om-ET' }

export function addisDay(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function dayBefore(day: string): string {
  const date = new Date(`${day}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

function groupKey(at: string): TranslationKey {
  const today = addisDay()
  const day = addisDay(new Date(at))
  if (day === today) return 'groupToday'
  if (day === dayBefore(today)) return 'groupYesterday'
  return 'groupEarlier'
}

/** Splits a newest-first list into Today, Yesterday and Earlier. */
export function groupByDay<T>(items: T[], at: (item: T) => string): { key: TranslationKey; items: T[] }[] {
  const groups: { key: TranslationKey; items: T[] }[] = []
  for (const item of items) {
    const key = groupKey(at(item))
    const last = groups.at(-1)
    if (last?.key === key) last.items.push(item)
    else groups.push({ key, items: [item] })
  }
  return groups
}

/** The time for today, the date and time for any other day. */
export function whenText(at: string, language: AppLanguage): string {
  const date = new Date(at)
  const today = addisDay(date) === addisDay()
  return new Intl.DateTimeFormat(LOCALES[language], {
    timeZone: TIME_ZONE,
    ...(today ? {} : { month: 'short', day: 'numeric' }),
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}
