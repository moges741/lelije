import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/app-context'
import { BRAND, BRAND_AM } from '../i18n'
import { EditorialMedia } from './EditorialMedia'
import { Icon } from './Icon'
import { LanguageSwitcher } from './LanguageSwitcher'
import { TopBar } from './TopBar'

export type AuthRole = 'parent' | 'child'

/**
 * Shared frame for every account screen: 2-column studio split on desktop with
 * editorial artwork and calm copy on the left, elevated form surface on the right.
 */
export function AuthShell({
  backTo,
  title,
  lead,
  badge,
  tabs,
  children,
}: {
  backTo: string
  title: string
  lead?: string
  badge?: string
  tabs?: ReactNode
  children: ReactNode
}) {
  const { t } = useApp()
  return (
    <main className="screen screen-auth">
      <TopBar backTo={backTo}>
        <LanguageSwitcher />
      </TopBar>

      <div className="auth-layout">
        <section className="auth-story">
          <div className="auth-story-copy">
            <p className="auth-brand">
              <span>{BRAND}</span>
              <span lang="am">{BRAND_AM}</span>
            </p>
            {badge && <p className="kicker">{badge}</p>}
            <h1 className="auth-title">{title}</h1>
            {lead && <p className="auth-lead">{lead}</p>}
          </div>
          <div className="auth-media-frame">
            <EditorialMedia
              src="/images/family_auth_art.jpg"
              alt={t('heroArtAlt')}
              className="auth-media-img"
              fallbackIcon="family"
              fallbackTone="teal"
            />
          </div>
        </section>

        <section className="auth-card-col">
          {tabs}
          <div className="auth-body">{children}</div>
        </section>
      </div>
    </main>
  )
}

/** Switches between creating an account (or joining) and signing in, keeping the same role. */
export function AuthTabs({ role, active }: { role: AuthRole; active: 'register' | 'login' }) {
  const { t } = useApp()
  return (
    <nav className="auth-tabs" aria-label={t('signIn')}>
      <Link
        className="auth-tab"
        aria-current={active === 'register' ? 'page' : undefined}
        to={role === 'parent' ? '/register/family' : '/register/child'}
      >
        {t(role === 'parent' ? 'tabCreate' : 'tabJoin')}
      </Link>
      <Link
        className="auth-tab"
        aria-current={active === 'login' ? 'page' : undefined}
        to={`/login?role=${role}`}
      >
        {t('tabSignIn')}
      </Link>
    </nav>
  )
}

/** The grown-up path: create an account, then add a child. */
export function Steps({ current }: { current: 1 | 2 }) {
  const { t } = useApp()
  return (
    <ol className="steps">
      <li className={current === 1 ? 'is-on' : 'is-done'} aria-current={current === 1 ? 'step' : undefined}>
        <span>{current === 1 ? '1' : <Icon name="check" size={15} />}</span>
        {t('stepAccount')}
      </li>
      <li className={current === 2 ? 'is-on' : undefined} aria-current={current === 2 ? 'step' : undefined}>
        <span>2</span>
        {t('stepChild')}
      </li>
    </ol>
  )
}
