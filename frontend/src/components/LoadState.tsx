import type { Failure } from '../api/http'
import { useApp } from '../context/app-context'
import { failureKey } from '../lib/failure'

/** What a screen shows before its data arrives: loading, or why it failed and a retry. */
export function LoadState({ error, onRetry }: { error: Failure | null; onRetry: () => void }) {
  const { t } = useApp()
  if (!error) {
    return (
      <p className="lead" aria-busy="true">
        {t('loading')}
      </p>
    )
  }
  return (
    <div className="empty" role="alert">
      <p className="lead">{t(failureKey(error))}</p>
      <button type="button" className="btn btn-plain" onClick={onRetry}>
        {t('retry')}
      </button>
    </div>
  )
}
