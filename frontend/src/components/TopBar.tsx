import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/app-context'
import { BRAND } from '../i18n'
import { Icon } from './Icon'

export function TopBar({ backTo, children }: { backTo?: string; children?: ReactNode }) {
  const { t } = useApp()
  return (
    <header className="topbar">
      <div className="topbar-start">
        {backTo ? (
          <Link className="icon-btn" to={backTo} aria-label={t('back')}>
            <Icon name="back" size={20} />
          </Link>
        ) : (
          <Link className="wordmark" to="/">
            {BRAND}
          </Link>
        )}
      </div>
      <div className="topbar-end">{children}</div>
    </header>
  )
}
