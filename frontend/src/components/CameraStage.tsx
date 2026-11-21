import type { ReactNode, RefObject } from 'react'
import { useApp } from '../context/app-context'
import { KidFigure } from './KidFigure'

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>
  /** Demo mode has no camera picture, so a figure stands in. */
  mock: boolean
  message: string | null
  children?: ReactNode
}

/** Frontend owns the video element and layout; ai/pose only reads from it. */
export function CameraStage({ videoRef, mock, message, children }: Props) {
  const { t } = useApp()
  return (
    <div className="stage">
      <video
        ref={videoRef}
        className="stage-video"
        muted
        playsInline
        aria-label={t('videoLabel')}
      />
      {mock && <KidFigure className="stage-kid" />}
      {children}
      {message && (
        <p className="stage-status" role="status">
          {message}
        </p>
      )}
    </div>
  )
}
