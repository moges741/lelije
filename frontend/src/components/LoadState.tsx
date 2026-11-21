import type { Failure } from '../api/http'
import { useApp } from '../context/app-context'
import { failureKey } from '../lib/failure'

/** What a screen shows before its data arrives: shimmering skeletons, or why it failed with a retry. */
export function LoadState({ error, onRetry }: { error: Failure | null; onRetry: () => void }) {
  const { t } = useApp()
  if (!error) {
    return (
      <div className="skeleton-stack" role="status" aria-busy="true" aria-label={t('loading')}>
        <div className="skeleton-card" />
        <div className="skeleton-card is-short" />
        <div className="skeleton-card" />
      </div>
    )
  }
  return (
    <div className="empty error-card" role="alert">
      <p className="lead">{t(failureKey(error))}</p>
      <button type="button" className="btn btn-plain" onClick={onRetry}>
        {t('retry')}
      </button>
    </div>
  )
}
