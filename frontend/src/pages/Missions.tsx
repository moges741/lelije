import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import * as api from '../api/client'
import { Icon } from '../components/Icon'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { MissionCard } from '../components/MissionCard'
import { PinPrompt } from '../components/PinPrompt'
import { TopBar } from '../components/TopBar'
import { useApp } from '../context/app-context'
import { failureKey } from '../lib/failure'
import { missionState, PLAY_TEXT } from '../lib/progress'
import { useAutoRefresh, useRemote } from '../lib/useRemote'

/** Screen 2: the child's home. Today's missions, points, play time and the game. */
export function Missions() {
  const {
    t,
    session,
    setSession,
    missions,
    missionsStatus,
    missionsError,
    missionsOffline,
    reloadMissions,
    progress,
    refreshProgress,
  } = useApp()
  const navigate = useNavigate()
  const [askingPin, setAskingPin] = useState(false)
  const code = session?.family.code ?? ''
  const childId = session?.child?.id ?? ''
  const notes = useRemote(
    childId ? `child-notes:${childId}` : null,
    () => api.notifications(code, { audience: 'child', childId }),
    20_000,
  )

  useEffect(() => {
    void refreshProgress()
  }, [refreshProgress])

  const waiting =
    progress !== null &&
    (progress.today.missionsPending.length > 0 || progress.today.playRequest?.status === 'sent')
  useAutoRefresh(waiting ? refreshProgress : null, 15_000)

  if (!session) return null
  const play = progress?.today.playRequest
  const unread = notes.data?.unread ?? 0
  const capReached = progress !== null && progress.pointsToday >= progress.dailyCap

  return (
    <main className="screen">
      <TopBar>
        <LanguageSwitcher />
        <Link className="icon-btn" to="/child/notifications" aria-label={t('notifications')}>
          <Icon name="bell" />
          {unread > 0 && <span className="dot">{unread}</span>}
        </Link>
        <Link className="icon-btn" to="/child/settings" aria-label={t('settings')}>
          <Icon name="settings" />
        </Link>
      </TopBar>

      {missionsOffline && (
        <p className="banner banner-warn" role="status">
          {t('offlineBanner')}
        </p>
      )}
      {play && play.status !== 'declined' && (
        <Link className={play.status === 'allowed' ? 'banner banner-ok' : 'banner'} to="/child/play">
          {t(PLAY_TEXT[play.status])}
        </Link>
      )}

      <div className="tally">
        <p className="tally-points">
          <Icon name="star" size={30} />
          <strong>{progress ? progress.pointsToday : '—'}</strong>
          <span>
            {t('pointsToday')}
            {progress && ` / ${progress.dailyCap}`}
          </span>
        </p>
        <p>
          <strong>{progress ? progress.totalPoints : '—'}</strong>
          <span>{t('totalPoints')}</span>
        </p>
        {progress && (
          <p>
            <Icon name="flame" />
            <strong>{progress.streak}</strong>
            <span>{t('streak')}</span>
          </p>
        )}
      </div>
      {capReached && (
        <p className="banner banner-ok" role="status">
          {t('capReached')}
        </p>
      )}

      <div>
        <h1 className="title">{t('todayTitle')}</h1>
        <p className="lead">{t('todaySubtitle')}</p>
      </div>

      {missionsStatus === 'loading' ? (
        <ul className="mission-list" aria-busy="true" aria-label={t('loading')}>
          <li className="mission-card is-skeleton" />
          <li className="mission-card is-skeleton" />
          <li className="mission-card is-skeleton" />
        </ul>
      ) : missionsStatus === 'error' ? (
        <div className="empty" role="alert">
          <p className="lead">{missionsError ? t(failureKey(missionsError)) : t('noMissions')}</p>
          <button type="button" className="btn btn-plain" onClick={reloadMissions}>
            {t('retry')}
          </button>
        </div>
      ) : (
        <ul className="mission-list">
          {missions.map((mission, index) => (
            <li key={mission.id} className="rise" style={{ animationDelay: `${index * 70}ms` }}>
              <MissionCard mission={mission} state={missionState(progress, mission.id)} />
            </li>
          ))}
        </ul>
      )}

      <Link className="btn btn-plain btn-block" to="/child/play">
        <Icon name="clock" />
        {t('requestPlay')}
      </Link>
      <button type="button" className="text-link" onClick={() => setAskingPin(true)}>
        {t('openParent')}
      </button>
      {askingPin && (
        <PinPrompt
          family={session.family}
          action={(pin) => api.checkFamilyPin(code, pin)}
          onCancel={() => setAskingPin(false)}
          onDone={(result) => {
            setAskingPin(false)
            if (!result.ok) return
            setSession({ ...session, role: 'parent', family: { ...session.family, hasPin: true } })
            navigate('/parent')
          }}
        />
      )}

      <Link className="stars-card" to="/stars">
        <span className="stars-card-sky" aria-hidden="true">
          <Icon name="star" size={18} />
          <Icon name="star" size={28} />
          <Icon name="star" size={14} />
        </span>
        <span className="mission-body">
          <strong>{t('playCatchStars')}</strong>
          <span>{progress?.today.game ? t('gameDoneToday') : t('catchStarsHint')}</span>
        </span>
        <span className="stars-card-play">
          <Icon name="play" size={26} />
        </span>
      </Link>
    </main>
  )
}
