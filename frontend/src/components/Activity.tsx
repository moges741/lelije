import { useApp } from '../context/app-context'
import { Icon } from './Icon'
import { SafetyBanner } from './SafetyBanner'

/**
 * Shared pieces of the activity screens (mission play and Catch the Stars), so
 * the camera explanation, the camera problem screen and the controls sit in the
 * same place in both: stage on top, stats and pause under it, then progress.
 */

/** Before camera access: say why the camera is needed, and offer to switch between camera and buttons. */
export function CameraIntro({
  mock,
  canUseCamera = false,
  onStart,
  onFallback,
  onUseCamera,
}: {
  /** True in keyboard/button mode; false in live webcam pose mode. */
  mock: boolean
  /** True when the browser supports live webcam access. */
  canUseCamera?: boolean
  onStart: () => void
  onFallback: () => void
  onUseCamera?: () => void
}) {
  const { t } = useApp()
  return (
    <>
      {mock ? (
        <p className="demo-note">{t('buttonsMode')}</p>
      ) : (
        <section className="camera-intro">
          <h2 className="how-title">{t('cameraWhyTitle')}</h2>
          <ul className="why-list">
            <li>
              <Icon name="camera" />
              {t('cameraWhy1')}
            </li>
            <li>
              <Icon name="shield" />
              {t('privacyNote')}
            </li>
            <li>
              <Icon name="hand" />
              {t('cameraWhy3')}
            </li>
          </ul>
        </section>
      )}
      <SafetyBanner privacy={false} />
      <div className="actions">
        <button type="button" className="btn btn-sun btn-block" onClick={onStart}>
          <Icon name={mock ? 'play' : 'camera'} />
          {t(mock ? 'startDemo' : 'allowCamera')}
        </button>
        {mock && canUseCamera && onUseCamera && (
          <button type="button" className="btn btn-plain btn-block" onClick={onUseCamera}>
            <Icon name="camera" />
            {t('allowCamera')}
          </button>
        )}
        {!mock && (
          <button type="button" className="btn btn-plain btn-block" onClick={onFallback}>
            {t('playWithButtons')}
          </button>
        )}
      </div>
    </>
  )
}

/** A refused or missing camera is not an error for the child: say so, and keep a way to play. */
export function CameraProblem({
  saving = false,
  onRetry,
  onButtons,
  onGrownUp,
}: {
  saving?: boolean
  onRetry: () => void
  onButtons: () => void
  /** Missions can also be confirmed by a grown-up. */
  onGrownUp?: () => void
}) {
  const { t } = useApp()
  return (
    <>
      <div className="detail-head rise">
        <span className="mission-icon is-big">
          <Icon name="camera" size={40} />
        </span>
        <h1 className="title">{t('cameraProblemTitle')}</h1>
        <p className="lead">{t('cameraProblemBody')}</p>
      </div>
      <div className="actions">
        <button type="button" className="btn btn-sun btn-block" disabled={saving} onClick={onRetry}>
          <Icon name="camera" />
          {t('tryAgainCamera')}
        </button>
        <button type="button" className="btn btn-plain btn-block" disabled={saving} onClick={onButtons}>
          {t('playWithButtons')}
        </button>
        {onGrownUp && (
          <button type="button" className="btn btn-plain btn-block" disabled={saving} onClick={onGrownUp}>
            {saving ? t('saving') : t('grownUpConfirm')}
          </button>
        )}
      </div>
    </>
  )
}

interface Stat {
  value: string | number
  label: string
}

/** Two stats and the pause button, in the same row on every activity screen. */
export function ActivityHud({
  main,
  side,
  paused,
  disabled,
  onPause,
}: {
  main: Stat
  side: Stat
  paused: boolean
  disabled: boolean
  onPause: () => void
}) {
  const { t } = useApp()
  return (
    <div className="hud">
      <p className="counter" aria-live="polite">
        <strong key={main.value}>{main.value}</strong>
        <span>{main.label}</span>
      </p>
      <p className="counter">
        <strong>{side.value}</strong>
        <span>{side.label}</span>
      </p>
      <button type="button" className="btn btn-plain hud-pause" disabled={disabled} onClick={onPause}>
        {t(paused ? 'resume' : 'pause')}
      </button>
    </div>
  )
}

/** A thin bar for time left, in the slot where missions show their stars. */
export function TimeBar({ value, max, label }: { value: number; max: number; label: string }) {
  const percent = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  return (
    <div
      className="time-bar"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(max / 1000)}
      aria-valuenow={Math.round(value / 1000)}
    >
      <span style={{ width: `${percent}%` }} />
    </div>
  )
}
