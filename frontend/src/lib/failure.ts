import type { Failure } from '../api/http'
import type { TranslationKey } from '../i18n'

export function failureKey(error: Failure): TranslationKey {
  if (error === 'network') return 'networkError'
  if (error === 'too_many') return 'tryLater'
  return 'somethingWrong'
}

/** Failures a grown-up fixes by typing the PIN again (or waiting out the lock). */
export function isPinFailure(error: Failure): boolean {
  return error === 'invalid' || error === 'forbidden' || error === 'too_many' || error === 'network'
}

export function pinFailureKey(error: Failure): TranslationKey {
  if (error === 'invalid') return 'pinInvalid'
  if (error === 'forbidden') return 'pinWrong'
  if (error === 'too_many') return 'pinLocked'
  return failureKey(error)
}
