import { useApp } from '../context/app-context'
import { POSE_MOCK } from '../lib/pose/load'
import type { ActionType } from '../lib/pose/types'
import { Icon } from './Icon'

const KEYS: Record<ActionType, { key: string; code: string }> = {
  jump: { key: 'j', code: 'KeyJ' },
  armsUp: { key: 'a', code: 'KeyA' },
}

/** The mock engine listens for keys (J = jump, A = arms up); buttons press them for touch screens. */
function press(action: ActionType) {
  document.body.dispatchEvent(
    new KeyboardEvent('keydown', { ...KEYS[action], bubbles: true }),
  )
}

/**
 * The tap and keyboard way to play. Shown in the demo build (labelled as a demo)
 * and whenever the child chose to play with buttons instead of the camera.
 */
export function MockControls({ actions }: { actions: ActionType[] }) {
  const { t } = useApp()
  return (
    <div className="mock-controls">
      <p className="demo-note">{t(POSE_MOCK ? 'demoMode' : 'buttonsMode')}</p>
      <div className="mock-buttons">
        {actions.map((action) => (
          <button
            key={action}
            type="button"
            className="btn btn-sun"
            onClick={() => press(action)}
          >
            <Icon name={action === 'jump' ? 'jump' : 'arms'} />
            {t(action === 'jump' ? 'actionJump' : 'actionArmsUp')}
            <kbd>{KEYS[action].key.toUpperCase()}</kbd>
          </button>
        ))}
      </div>
    </div>
  )
}
