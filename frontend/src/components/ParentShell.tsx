import { useState, type ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useApp } from '../context/app-context'
import { BRAND } from '../i18n'
import { Icon, type IconName } from './Icon'
import { LanguageSwitcher } from './LanguageSwitcher'

const NAV_COPY = {
  en: {
    overview: 'Overview',
    activity: 'Activity & AI',
    requests: 'Play Requests',
    family: 'Family & Kids',
    notifications: 'Notifications',
    settings: 'Settings',
  },
  am: {
    overview: 'ማጠቃለያ',
    activity: 'እንቅስቃሴ እና AI',
    requests: 'የጨዋታ ጥያቄ',
    family: 'ቤተሰብ እና ልጆች',
    notifications: 'ማሳወቂያዎች',
    settings: 'ቅንብሮች',
  },
  om: {
    overview: 'Cuunfaa',
    activity: 'Sochii fi AI',
    requests: 'Gaaffii Taphaa',
    family: 'Maatii fi Ijoollee',
    notifications: 'Beeksisa',
    settings: 'Qindaa’ina',
  },
} as const

interface NavEntry {
  to: string
  end?: boolean
  icon: IconName
  label: string
  badge?: number
}

/**
 * Calm, structured executive workspace shell dedicated exclusively to parents.
 * Desktop uses a 252px left sidebar; mobile collapses to a clean top bar + tab strip.
 */
export function ParentShell({
  title,
  subtitle,
  action,
  unreadCount = 0,
  waitingPlayCount = 0,
  children,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
  unreadCount?: number
  waitingPlayCount?: number
  children: ReactNode
}) {
  const { t, language, session, signOut } = useApp()
  const [copied, setCopied] = useState(false)
  const family = session?.family
  const copy = NAV_COPY[language] ?? NAV_COPY.en

  const navItems: NavEntry[] = [
    { to: '/parent', end: true, icon: 'family', label: copy.overview },
    { to: '/parent/activity', icon: 'star', label: copy.activity },
    { to: '/parent/play', icon: 'clock', label: copy.requests, badge: waitingPlayCount },
    { to: '/family', icon: 'child', label: copy.family },
    { to: '/parent/notifications', icon: 'bell', label: copy.notifications, badge: unreadCount },
    { to: '/parent/settings', icon: 'settings', label: copy.settings },
  ]

  const copyCode = () => {
    if (!family?.code) return
    void navigator.clipboard?.writeText(family.code).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    })
  }

  return (
    <div className="parent-shell theme-parent">
      <aside className="parent-sidebar" aria-label={t('roleParent')}>
        <div className="parent-sidebar-head">
          <Link className="wordmark" to="/">
            {BRAND}
          </Link>
          {family && (
            <div className="parent-family-meta">
              <strong>{family.name}</strong>
              <span>{t('roleParent')}</span>
            </div>
          )}
        </div>

        <nav className="parent-sidebar-nav" aria-label="Parent workspace">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                isActive ? 'parent-nav-item is-active' : 'parent-nav-item'
              }
            >
              <Icon name={item.icon} size={18} />
              <span className="parent-nav-label">{item.label}</span>
              {item.badge && item.badge > 0 ? (
                <span className="parent-nav-count">{item.badge}</span>
              ) : null}
            </NavLink>
          ))}
        </nav>

        <div className="parent-sidebar-foot">
          {family && (
            <div className="parent-code-box">
              <span className="parent-code-label">{t('familyCode')}</span>
              <div className="parent-code-row">
                <code>{family.code}</code>
                <button type="button" className="text-link" onClick={copyCode}>
                  {copied ? t('codeCopied') : t('copyCode')}
                </button>
              </div>
            </div>
          )}
          <Link className="btn btn-plain btn-block btn-sm" to="/">
            {t('home')}
          </Link>
          <button type="button" className="btn btn-plain btn-block btn-sm" onClick={signOut}>
            {t('signOut')}
          </button>
        </div>
      </aside>

      <div className="parent-workspace">
        <header className="parent-topbar">
          <div className="parent-topbar-brand">
            <Link className="wordmark" to="/">
              {BRAND}
            </Link>
            {family && <span className="parent-topbar-family">{family.name}</span>}
          </div>
          <div className="parent-topbar-end">
            <Link className="btn btn-ghost btn-sm" to="/">
              {t('home')}
            </Link>
            <LanguageSwitcher />
            <button type="button" className="btn btn-ghost btn-sm parent-mobile-signout" onClick={signOut}>
              {t('signOut')}
            </button>
          </div>
        </header>

        <nav className="parent-mobile-nav" aria-label="Parent sections">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                isActive ? 'parent-mobile-link is-active' : 'parent-mobile-link'
              }
            >
              <Icon name={item.icon} size={16} />
              <span>{item.label}</span>
              {item.badge && item.badge > 0 ? (
                <span className="parent-nav-count">{item.badge}</span>
              ) : null}
            </NavLink>
          ))}
        </nav>

        {family && (
          <div className="parent-mobile-code">
            <span>
              {t('familyCode')}: <code>{family.code}</code>
            </span>
            <button type="button" className="text-link" onClick={copyCode}>
              {copied ? t('codeCopied') : t('copyCode')}
            </button>
          </div>
        )}

        <main className="parent-main">
          <div className="parent-page-head">
            <div className="parent-page-titles">
              <h1 className="parent-title">{title}</h1>
              {subtitle && <p className="parent-subtitle">{subtitle}</p>}
            </div>
            {action && <div className="parent-page-action">{action}</div>}
          </div>

          <div className="parent-page-body">{children}</div>
        </main>
      </div>
    </div>
  )
}
