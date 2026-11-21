import { useState } from 'react'
import { checkPin, hasPin, isValidPin, PIN_LENGTH, savePin } from '../api/pin'
import { useApp } from '../context/app-context'
import { SecretField } from './TextField'

/**
 * Asks for the grown-up PIN before an action. If this device has no PIN for the
 * family yet (for example a grown-up who signed in with the code on a new phone),
 * the same prompt sets one instead.
 */
export function PinPrompt({
  familyCode,
  onSuccess,
  onCancel,
}: {
  familyCode: string
  onSuccess: () => void
  onCancel: () => void
}) {
  const { t } = useApp()
  const [setting] = useState(() => !hasPin(familyCode))
  const [pin, setPin] = useState('')
  const [error, setError] = useState<'invalid' | 'wrong' | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!isValidPin(pin)) {
      setError('invalid')
      return
    }
    setBusy(true)
    if (setting) {
      await savePin(familyCode, pin)
      setBusy(false)
      onSuccess()
      return
    }
    const ok = await checkPin(familyCode, pin)
    setBusy(false)
    if (!ok) {
      setPin('')
      setError('wrong')
      return
    }
    onSuccess()
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
            setPin(event.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH))
          }}
          error={error === 'invalid' ? t('pinInvalid') : error === 'wrong' ? t('pinWrong') : undefined}
        />
        <div className="row-actions">
          <button type="submit" className="btn btn-sun" disabled={busy}>
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
