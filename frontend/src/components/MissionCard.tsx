import type { MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/app-context'
import { missionIcon } from '../lib/missionIcon'
import type { MissionState } from '../lib/progress'
import { isVoiceSupported, speakText } from '../lib/voice'
import type { Mission } from '../types/mission'
import { Icon } from './Icon'

const STATE_LABEL: Record<MissionState, 'completed' | 'statusWaiting' | 'statusRedo' | null> = {
  done: 'completed',
  pending: 'statusWaiting',
  redo: 'statusRedo',
  todo: null,
}

/**
 * Playful, tap-friendly child quest card with one-tap voice read-aloud.
 */
export function MissionCard({ mission, state }: { mission: Mission; state: MissionState }) {
  const { t, language } = useApp()
  const camera = mission.verification === 'pose'
  const finished = state === 'done' || state === 'pending'
  const stateLabel = STATE_LABEL[state]
  const stateClass =
    state === 'done'
      ? 'is-done'
      : state === 'pending'
        ? 'is-pending'
        : state === 'redo'
          ? 'is-redo'
          : ''

  const hearMission = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const spoken = `${mission.title}. ${mission.description}. +${mission.points} ${t('points')}.`
    speakText(spoken, language)
  }

  return (
    <div className={`mission-row-wrap ${stateClass}`.trim()}>
      <Link
        className={`mission-card child-quest-card ${stateClass}`.trim()}
        to={`/missions/${encodeURIComponent(mission.id)}`}
      >
        <span className={`mission-icon ${camera ? 'is-camera' : 'is-self'}`}>
          <Icon
            name={state === 'done' ? 'check' : state === 'pending' ? 'clock' : missionIcon(mission)}
            size={26}
          />
        </span>
        <span className="mission-body">
          <strong>{mission.title}</strong>
          <span className="mission-meta">
            <span className="mission-points">
              <Icon name="star" size={15} />+{mission.points}
            </span>
            <span className="meta-sep" aria-hidden="true">
              ·
            </span>
            <span className="meta-unit">
              {mission.durationMin} {t('minutes')}
            </span>
            <span className="meta-sep" aria-hidden="true">
              ·
            </span>
            <span
              className={`mission-verify ${
                state === 'redo'
                  ? 'is-redo'
                  : state === 'pending'
                    ? 'is-waiting'
                    : state === 'done'
                      ? 'is-done'
                      : ''
              }`}
            >
              {stateLabel ? t(stateLabel) : camera ? t('cameraMission') : t('grownUpConfirm')}
            </span>
          </span>
        </span>
        <span className="mission-go" aria-hidden="true">
          <Icon name={finished ? (state === 'done' ? 'check' : 'clock') : 'play'} size={19} />
        </span>
      </Link>
      {isVoiceSupported() && (
        <button
          type="button"
          className="quest-speak-btn"
          aria-label={`Read ${mission.title}`}
          title={`Read ${mission.title}`}
          onClick={hearMission}
        >
          <Icon name="volume" size={20} />
        </button>
      )}
    </div>
  )
}
