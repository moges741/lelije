import { useApp } from '../context/app-context'
import { Icon } from './Icon'

/** Shown before every camera screen (Build Contract 8.3) and on every mission page. */
export function SafetyBanner({ privacy = true }: { privacy?: boolean }) {
  const { t } = useApp()
  return (
    <aside className="safety">
      <Icon name="shield" size={28} />
      <p>
        <strong>{t('safetyTitle')}</strong>
        {t('safetyBody')}
        {privacy && <span className="safety-privacy">{t('privacyNote')}</span>}
      </p>
    </aside>
  )
}
