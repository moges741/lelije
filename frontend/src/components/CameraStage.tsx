import type { ReactNode, RefObject } from 'react'
import { useApp } from '../context/app-context'
import { Icon, type IconName } from './Icon'
import { KidFigure } from './KidFigure'

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>
  /** Demo mode has no camera picture, so a figure stands in. */
  mock: boolean
  message: string | null
  /** What to do, shown as a small pill at the top of the picture. */
  instruction?: string
  instructionIcon?: IconName
  /** Let the instruction fade away after a few seconds so it never covers the game. */
  instructionFades?: boolean
  /** A shorter stage while the camera is still off. */
  compact?: boolean
  children?: ReactNode
}

/** Frontend owns the video element and layout; ai/pose only reads from it. */
export function CameraStage({
  videoRef,
  mock,
  message,
  instruction,
  instructionIcon,
  instructionFades,
  compact,
  children,
}: Props) {
  const { t } = useApp()
  return (
    <div className={compact ? 'stage is-compact' : 'stage'}>
      <video
        ref={videoRef}
        className="stage-video"
        muted
        playsInline
        aria-label={t('videoLabel')}
      />
      {mock && <KidFigure className="stage-kid" />}
      {children}
      {instruction && (
        <p className={instructionFades ? 'stage-instruction is-fading' : 'stage-instruction'}>
          {instructionIcon && <Icon name={instructionIcon} size={20} />}
          {instruction}
        </p>
      )}
      {message && (
        <p className="stage-status" role="status">
          {message}
        </p>
      )}
    </div>
  )
}
