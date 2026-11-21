import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import * as api from '../../api/client'
import type { Failure } from '../../api/http'
import { Icon } from '../../components/Icon'
import { LanguageSwitcher } from '../../components/LanguageSwitcher'
import { AppNav } from '../../components/NavBar'
import { TalkingBuddy } from '../../components/TalkingBuddy'
import { Panel } from '../../components/TextField'
import { TopBar } from '../../components/TopBar'
import { useApp } from '../../context/app-context'
import { failureKey } from '../../lib/failure'
import { PLAY_TEXT } from '../../lib/progress'
import { useAutoRefresh } from '../../lib/useRemote'
import { Notifications } from '../Notifications'

export function ChildSettings() {
  const { t, session, signOut } = useApp()
  const child = session?.child
  if (!child) return null
  return (
    <div className="theme-child">
      <main className="screen screen-narrow">
        <TopBar backTo="/missions">
          <LanguageSwitcher />
        </TopBar>
        <div className="section-head">
          <h1 className="title">{t('settingsTitle')}</h1>
          <p className="lead">
            {child.nickname || t('childProfile')} · {t('age')} {child.age}
          </p>
        </div>
        <Panel>
          <p className="meta privacy-inline">
            <Icon name="shield" size={18} />
            <span>{t('privacyNote')}</span>
          </p>
          <div className="stack">
            <Link className="btn btn-plain btn-block" to="/child/play">
              <Icon name="clock" size={18} />
              {t('playTime')}
            </Link>
            <button type="button" className="btn btn-plain btn-block" onClick={signOut}>
              {t('signOut')}
            </button>
          </div>
        </Panel>
      </main>
    </div>
  )
}

/** The child asks; a grown-up answers with the PIN on their side. */
export function ChildPlay() {
  const { t, session, progress, refreshProgress } = useApp()
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<Failure | null>(null)
  const request = progress?.today.playRequest ?? null

  useEffect(() => {
    void refreshProgress()
  }, [refreshProgress])
  useAutoRefresh(request?.status === 'sent' ? refreshProgress : null, 10_000)

  const child = session?.child
  if (!child) return null

  const ask = async () => {
    setAsking(true)
    setError(null)
    const result = await api.askForPlay(child.id)
    if (result.ok) await refreshProgress()
    else setError(result.error)
    setAsking(false)
  }

  const statusText =
    progress === null ? t('loading') : t(request ? PLAY_TEXT[request.status] : 'playIntro')

  return (
    <div className="theme-child">
      <main className="screen screen-narrow">
        <TopBar backTo="/missions" />
        <AppNav role="child" />
        <TalkingBuddy message={statusText} />
        <Panel>
          <div className="detail-head rise">
            <span className={`mission-icon is-big ${request?.status === 'allowed' ? 'is-camera' : 'is-self'}`}>
              <Icon name={request?.status === 'allowed' ? 'check' : 'clock'} size={36} />
            </span>
            <h1 className="title">{t('playTime')}</h1>
            <p className="lead">{statusText}</p>
          </div>
          {error && (
            <p className="banner banner-warn" role="alert">
              {t(failureKey(error))}
            </p>
          )}
          {progress !== null && request?.status !== 'sent' && (
            <div className="actions">
              <button
                type="button"
                className="btn btn-sun btn-block btn-kid-cta"
                disabled={asking}
                aria-busy={asking}
                onClick={() => void ask()}
              >
                {asking ? t('saving') : t(request ? 'askAgain' : 'requestPlay')}
              </button>
            </div>
          )}
        </Panel>
      </main>
    </div>
  )
}

export function ChildNotifications() {
  return <Notifications audience="child" />
}
