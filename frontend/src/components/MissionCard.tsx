import { Link } from 'react-router-dom'
import { useApp } from '../context/app-context'
import { missionIcon } from '../lib/missionIcon'
import type { MissionState } from '../lib/progress'
import type { Mission } from '../types/mission'
import { Icon } from './Icon'

const BADGE: Record<MissionState, 'completed' | 'statusWaiting' | 'statusRedo' | null> = {
  done: 'completed',
  pending: 'statusWaiting',
  redo: 'statusRedo',
  todo: null,
}

/**
 * The single mission layout: icon, short title, time and points, who checks it,
 * and one tap target (the whole card).
 */
export function MissionCard({ mission, state }: { mission: Mission; state: MissionState }) {
  const { t } = useApp()
  const camera = mission.verification === 'pose'
  const finished = state === 'done' || state === 'pending'
  const badge = BADGE[state]
  return (
    <Link
      className={finished ? 'mission-card is-done' : 'mission-card'}
      to={`/missions/${encodeURIComponent(mission.id)}`}
    >
      <span className="mission-icon">
        <Icon name={state === 'done' ? 'check' : state === 'pending' ? 'clock' : missionIcon(mission)} size={28} />
      </span>
      <span className="mission-body">
        <strong>{mission.title}</strong>
        <span className="mission-meta">
          <span>
            <Icon name="clock" size={16} />
            {mission.durationMin} {t('minutes')}
          </span>
          <span className="mission-points">
            <Icon name="star" size={16} />+{mission.points}
          </span>
        </span>
        <span className={camera ? 'mission-badge is-camera' : 'mission-badge is-grownup'}>
          <Icon name={camera ? 'camera' : 'family'} size={14} />
          {badge ? t(badge) : camera ? t('cameraMission') : t('grownUpConfirm')}
        </span>
      </span>
      <span className="mission-go" aria-hidden="true">
        <Icon name={state === 'done' ? 'check' : state === 'pending' ? 'clock' : 'play'} size={20} />
      </span>
    </Link>
  )
}
