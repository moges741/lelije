import { Link } from 'react-router-dom'
import { useApp } from '../context/app-context'
import type { Mission } from '../types/mission'
import { Icon, type IconName } from './Icon'

/** One small picture per mission, chosen from what the mission asks for. */
export function missionIcon(mission: Mission): IconName {
  if (mission.goal) return mission.goal.detector === 'jump' ? 'jump' : 'arms'
  if (mission.type === 'helper') return 'hand'
  if (mission.type === 'physical') return 'flame'
  return 'star'
}

/**
 * The single mission layout: icon, short title, time and points, who checks it,
 * and one tap target (the whole card).
 */
export function MissionCard({
  mission,
  state,
}: {
  mission: Mission
  state: 'todo' | 'done' | 'pending'
}) {
  const { t } = useApp()
  const camera = mission.verification === 'pose'
  const finished = state !== 'todo'
  return (
    <Link
      className={finished ? 'mission-card is-done' : 'mission-card'}
      to={`/missions/${encodeURIComponent(mission.id)}`}
    >
      <span className="mission-icon">
        <Icon name={state === 'done' ? 'check' : missionIcon(mission)} size={28} />
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
          {state === 'done'
            ? t('completed')
            : state === 'pending'
              ? t('waitingApprovalDemo')
              : camera
                ? t('cameraMission')
                : t('grownUpConfirm')}
        </span>
      </span>
      <span className="mission-go" aria-hidden="true">
        <Icon name={finished ? 'check' : 'play'} size={20} />
      </span>
    </Link>
  )
}
