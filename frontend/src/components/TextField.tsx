import { useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { useApp } from '../context/app-context'
import { Icon, type IconName } from './Icon'

export function TextField({
  label,
  hint,
  error,
  ...input
}: {
  label: string
  hint?: string
  error?: string
} & InputHTMLAttributes<HTMLInputElement>) {
  const id = input.id ?? input.name
  return (
    <label className="text-field" htmlFor={id}>
      <span>{label}</span>
      <input id={id} {...input} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} />
      {hint && !error && <small>{hint}</small>}
      {error && (
        <small id={`${id}-error`} className="field-error" role="alert">
          {error}
        </small>
      )}
    </label>
  )
}

/** A field whose characters are hidden until the user taps the eye button. */
export function SecretField({
  label,
  hint,
  error,
  ...input
}: {
  label: string
  hint?: string
  error?: string
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const { t } = useApp()
  const [shown, setShown] = useState(false)
  const id = input.id ?? input.name
  return (
    <div className="text-field">
      <label htmlFor={id}>{label}</label>
      <span className="secret-wrap">
        <input
          id={id}
          {...input}
          type={shown ? 'text' : 'password'}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <button
          type="button"
          className="secret-toggle"
          aria-pressed={shown}
          aria-label={shown ? t('hidePin') : t('showPin')}
          onClick={() => setShown((value) => !value)}
        >
          <Icon name={shown ? 'eyeOff' : 'eye'} />
        </button>
      </span>
      {hint && !error && <small>{hint}</small>}
      {error && (
        <small id={`${id}-error`} className="field-error" role="alert">
          {error}
        </small>
      )}
    </div>
  )
}

export function ChoiceCard({
  title,
  body,
  icon,
  badge,
  tone,
  onClick,
}: {
  title: string
  body: string
  icon?: IconName
  badge?: string
  tone?: 'child'
  onClick: () => void
}) {
  const className = ['path-card', icon && 'has-icon', tone === 'child' && 'is-child'].filter(Boolean).join(' ')
  return (
    <button type="button" className={className} onClick={onClick}>
      {icon && (
        <span className="path-icon">
          <Icon name={icon} size={30} />
        </span>
      )}
      <span className="path-text">
        {badge && <em className="path-badge">{badge}</em>}
        <strong>{title}</strong>
        <span>{body}</span>
      </span>
    </button>
  )
}

export function Panel({ children }: { children: ReactNode }) {
  return <section className="panel">{children}</section>
}
