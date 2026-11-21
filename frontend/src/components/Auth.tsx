import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/app-context'
import { BRAND, BRAND_AM } from '../i18n'
import { Icon } from './Icon'
import { LanguageSwitcher } from './LanguageSwitcher'
import { TopBar } from './TopBar'

export type AuthRole = 'parent' | 'child'

/**
 * Shared frame for every account screen (choose, register, sign in), so they
 * read as one product and match the landing page: same sky, sun and brand.
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
  return (
    <main className="screen auth">
      <TopBar backTo={backTo}>
        <LanguageSwitcher />
      </TopBar>
      <section className="auth-hero">
        <p className="auth-brand">
          <span>{BRAND}</span>
          <span lang="am">{BRAND_AM}</span>
        </p>
        {badge && <span className="auth-badge">{badge}</span>}
        <h1 className="auth-title">{title}</h1>
        {lead && <p className="auth-lead">{lead}</p>}
      </section>
      {tabs}
      <div className="auth-body">{children}</div>
    </main>
  )
}

/** Switches between creating an account (or joining) and signing in, keeping the same role. */
export function AuthTabs({ role, active }: { role: AuthRole; active: 'register' | 'login' }) {
  const { t } = useApp()
  return (
    <nav className="auth-tabs">
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
        <span>{current === 1 ? '1' : <Icon name="check" size={16} />}</span>
        {t('stepAccount')}
      </li>
      <li className={current === 2 ? 'is-on' : undefined} aria-current={current === 2 ? 'step' : undefined}>
        <span>2</span>
        {t('stepChild')}
      </li>
    </ol>
  )
}
