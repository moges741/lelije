import type { InputHTMLAttributes, ReactNode } from 'react'

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
        <small id={`${id}-error`} className="field-error">
          {error}
        </small>
      )}
    </label>
  )
}

export function ChoiceCard({
  title,
  body,
  onClick,
}: {
  title: string
  body: string
  onClick: () => void
}) {
  return (
    <button type="button" className="path-card" onClick={onClick}>
      <strong>{title}</strong>
      <span>{body}</span>
    </button>
  )
}

export function Panel({ children }: { children: ReactNode }) {
  return <section className="panel">{children}</section>
}
