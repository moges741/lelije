import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import * as api from '../../api/client'
import type { DemoPlay } from '../../api/client'
import { LanguageSwitcher } from '../../components/LanguageSwitcher'
import { TopBar } from '../../components/TopBar'
import { useApp } from '../../context/app-context'
import { Notifications } from '../parent/ParentScreens'

export function ChildSettings() {
  const { t, session, signOut } = useApp()
  if (!session || session.role !== 'child' || !session.child) return <Navigate to="/login" replace />
  return (
    <main className="screen">
      <TopBar backTo="/missions">
        <LanguageSwitcher />
      </TopBar>
      <h1 className="title">{t('settingsTitle')}</h1>
      <p className="lead">
        {session.child.nickname || t('childProfile')} · {t('age')} {session.child.age}
      </p>
      <p className="hint">{t('editUnavailable')}</p>
      <p className="hint">{t('privacyNote')}</p>
      <Link className="btn btn-plain btn-block" to="/child/play">
        {t('playTime')}
      </Link>
      <button type="button" className="btn btn-plain btn-block" onClick={signOut}>
        {t('signOut')}
      </button>
    </main>
  )
}

export function ChildPlay() {
  const { t, session } = useApp()
  const [rows, setRows] = useState<DemoPlay[]>([])
  useEffect(() => {
    if (session) setRows(api.playRequests(session.family.code).filter((row) => row.childId === session.child?.id))
  }, [session])
  const child = session?.role === 'child' ? session.child : null
  if (!session || !child) return <Navigate to="/login" replace />

  const reply = (id: string, status: 'allowed' | 'declined') => {
    api.answerPlay(id, status)
    setRows(api.playRequests(session.family.code).filter((row) => row.childId === child.id))
  }

  const latest = rows[0]
  return (
    <main className="screen">
      <TopBar backTo="/missions" />
      <h1 className="title">{t('playTime')}</h1>
      <p className="banner banner-demo">{t('demoBanner')}</p>
      {!latest ? (
        <p className="lead">{t('noPlay')}</p>
      ) : latest.status === 'sent' ? (
        <>
          <p className="lead">{t('playInvite')}</p>
          <button type="button" className="btn btn-sun btn-block" onClick={() => reply(latest.id, 'allowed')}>
            {t('acceptPlay')}
          </button>
          <button type="button" className="btn btn-plain btn-block" onClick={() => reply(latest.id, 'declined')}>
            {t('notNow')}
          </button>
        </>
      ) : (
        <p className="lead">
          {t(
            latest.status === 'allowed'
              ? 'playAllowed'
              : latest.status === 'later'
                ? 'playLater'
                : 'playDeclined',
          )}
        </p>
      )}
    </main>
  )
}

export function ChildNotifications() {
  return <Notifications audience="child" />
}
