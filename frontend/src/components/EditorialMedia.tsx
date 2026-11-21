import { useState } from 'react'
import { Icon, type IconName } from './Icon'

interface EditorialMediaProps {
  src: string
  alt: string
  className?: string
  fallbackIcon?: IconName
  fallbackTone?: 'light' | 'night' | 'teal'
}

/**
 * Resilient editorial artwork frame. Always sets referrerPolicy="no-referrer"
 * and renders a styled atmospheric fallback if an image fails to load.
 */
export function EditorialMedia({
  src,
  alt,
  className = '',
  fallbackIcon = 'star',
  fallbackTone = 'light',
}: EditorialMediaProps) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <div
        className={`media-fallback is-${fallbackTone} ${className}`.trim()}
        role="img"
        aria-label={alt}
      >
        <Icon name={fallbackIcon} size={44} />
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      className={className}
      onError={() => setFailed(true)}
    />
  )
}
