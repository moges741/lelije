import { Link } from 'react-router-dom'
import * as api from '../api/client'
import { Icon } from '../components/Icon'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { TopBar } from '../components/TopBar'
import { useApp } from '../context/app-context'

export function Missions() {
  const { t, missions, missionsReady, missionsOrigin, reloadMissions, progress, session, setSession } =
    useApp()
  const invite =
    session?.child &&
    api
      .playRequests(session.family.code)
      .find((item) => item.childId === session.child?.id && item.status === 'sent')

  return (
    <main className="screen">
      <TopBar>
        <LanguageSwitcher />
        <Link className="icon-btn" to="/child/notifications" aria-label={t('notifications')}>
          <Icon name="bell" />
        </Link>
        <Link className="icon-btn" to="/child/settings" aria-label={t('settings')}>
          <Icon name="settings" />
        </Link>
      </TopBar>

      {(session?.origin === 'demo' || missionsOrigin === 'demo') && (
        <p className="banner banner-demo">{t('demoBanner')}</p>
      )}

      {invite && (
        <Link className="banner" to="/child/play">
          {t('playInvite')}
        </Link>
      )}

      <div className="tally">
        <p className="tally-points">
          <Icon name="star" size={30} />
          <strong>{progress.origin === 'unknown' ? '—' : progress.totalPoints}</strong>
          <span>{t('totalPoints')}</span>
        </p>
        {progress.streak != null && (
          <p>
            <Icon name="flame" />
            <strong>{progress.streak}</strong>
            <span>{t('streak')}</span>
          </p>
        )}
      </div>

      <div>
        <h1 className="title">{t('todayTitle')}</h1>
        <p className="lead">{t('todaySubtitle')}</p>
      </div>

      {!missionsReady ? (
        <ul className="mission-list" aria-busy="true" aria-label={t('loading')}>
          <li className="mission-card is-skeleton" />
          <li className="mission-card is-skeleton" />
          <li className="mission-card is-skeleton" />
        </ul>
      ) : missions.length === 0 ? (
        <div className="empty">
          <p className="lead">{t('noMissions')}</p>
          <button type="button" className="btn btn-plain" onClick={reloadMissions}>
            {t('retry')}
          </button>
        </div>
      ) : (
        <ul className="mission-list">
          {missions.map((mission, index) => {
            const done = progress.todayCompleted.includes(mission.id)
            const pending = progress.pendingIds.includes(mission.id)
            const pose = mission.verification === 'pose'
            return (
              <li key={mission.id} className="rise" style={{ animationDelay: `${index * 70}ms` }}>
                <Link
                  className={done || pending ? 'mission-card is-done' : 'mission-card'}
                  to={`/missions/${encodeURIComponent(mission.id)}`}
                >
                  <span className="mission-icon">
                    <Icon name={done ? 'check' : pose ? 'camera' : 'hand'} size={28} />
                  </span>
                  <span className="mission-body">
                    <strong>{mission.title}</strong>
                    <span>
                      {mission.durationMin} {t('minutes')} ·{' '}
                      {done ? t('completed') : pending ? t('waitingApprovalDemo') : t(pose ? 'cameraMission' : 'selfMission')}
                    </span>
                  </span>
                  <span className="mission-points">+{mission.points}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      {session && (
        <button
          type="button"
          className="text-link"
          onClick={() => setSession({ ...session, role: 'parent' })}
        >
          {t('openParent')}
        </button>
      )}

      <Link className="stars-card" to="/stars">
        <span className="stars-card-sky" aria-hidden="true">
          <Icon name="star" size={18} />
          <Icon name="star" size={28} />
          <Icon name="star" size={14} />
        </span>
        <span className="mission-body">
          <strong>{t('playCatchStars')}</strong>
          <span>{t('catchStarsHint')}</span>
        </span>
        <span className="stars-card-play">
          <Icon name="play" size={26} />
        </span>
      </Link>
    </main>
  )
}
