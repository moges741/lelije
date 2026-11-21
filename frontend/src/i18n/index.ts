import { am } from './am'
import { en, type TranslationKey } from './en'
import { om } from './om'
import type { AppLanguage } from '../types/mission'

const dictionaries: Record<AppLanguage, Record<TranslationKey, string>> = { en, am, om }

export type { TranslationKey }
export type Translate = (key: TranslationKey) => string

/** The product name and each language's own name are not translated. */
export const BRAND = 'LeLije'
/** Shown beside the brand on the home page, in every language. */
export const BRAND_AM = 'ለልጄ'

export const LANGUAGES: { code: AppLanguage; name: string; short: string }[] = [
  { code: 'en', name: 'English', short: 'EN' },
  { code: 'am', name: 'አማርኛ', short: 'አማ' },
  { code: 'om', name: 'Afaan Oromoo', short: 'OM' },
]

export function isLanguage(value: unknown): value is AppLanguage {
  return value === 'en' || value === 'am' || value === 'om'
}

export function tFactory(language: AppLanguage): Translate {
  return (key) => dictionaries[language][key] ?? en[key]
}
