import { useState } from 'react'
import * as api from '../api/client'
import type { Result } from '../api/http'
import { useApp } from '../context/app-context'
import type { TranslationKey } from '../i18n'
import { isPinFailure, pinFailureKey } from '../lib/failure'
import { isValidPin, PIN_LENGTH, pinDigits } from '../lib/pin'
import type { FamilyRecord } from '../types/account'
import { SecretField } from './TextField'

/**
 * Asks for the grown-up PIN and runs a parent action with it; the server checks
 * the PIN. PIN problems stay in the dialog, any other result goes to onDone.
 * A family that has no PIN yet chooses one here first.
 */
export function PinPrompt<T>({
  family,
  action,
  onDone,
  onCancel,
}: {
  family: FamilyRecord
  action: (pin: string) => Promise<Result<T>>
  onDone: (result: Result<T>) => void
  onCancel: () => void
}) {
  const { t, session, setSession } = useApp()
  const [setting, setSetting] = useState(!family.hasPin)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<TranslationKey | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!isValidPin(pin)) {
      setError('pinInvalid')
      return
    }
    setBusy(true)
    setError(null)
    if (setting) {
      const saved = await api.setFamilyPin(family.code, pin)
      if (!saved.ok) {
        setBusy(false)
        setError(pinFailureKey(saved.error))
        return
      }
      setSetting(false)
      if (session?.family.code === family.code) {
        setSession({ ...session, family: { ...session.family, hasPin: true } })
      }
    }
    const result = await action(pin)
    setBusy(false)
    if (!result.ok && isPinFailure(result.error)) {
      setPin('')
      setError(pinFailureKey(result.error))
      return
    }
    onDone(result)
  }

  return (
    <div className="pin-overlay" role="dialog" aria-modal="true" aria-labelledby="pin-title">
      <form
        className="panel pin-dialog"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <h2 className="panel-title" id="pin-title">
          {setting ? t('pinSetTitle') : t('pinEnterTitle')}
        </h2>
        <p className="lead">{setting ? t('pinSetLead') : t('pinEnterLead')}</p>
        <SecretField
          name="pin"
          inputMode="numeric"
          pattern="[0-9]*"
          label={t('pinLabel')}
          value={pin}
          maxLength={PIN_LENGTH}
          autoComplete="off"
          autoFocus
          onChange={(event) => {
            setError(null)
            setPin(pinDigits(event.target.value))
          }}
          error={error ? t(error) : undefined}
        />
        <div className="row-actions">
          <button type="submit" className="btn btn-sun" disabled={busy} aria-busy={busy}>
            {t('pinContinue')}
          </button>
          <button type="button" className="btn btn-plain" onClick={onCancel}>
            {t('pinCancel')}
          </button>
        </div>
      </form>
    </div>
  )
}
