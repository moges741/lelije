import { useApp } from '../context/app-context'
import { LANGUAGES } from '../i18n'

export function LanguageSwitcher() {
  const { t, language, setLanguage } = useApp()
  return (
    <div className="lang" role="group" aria-label={t('language')}>
      {LANGUAGES.map((item) => (
        <button
          key={item.code}
          type="button"
          lang={item.code}
          className={item.code === language ? 'is-on' : undefined}
          aria-pressed={item.code === language}
          aria-label={item.name}
          onClick={() => setLanguage(item.code)}
        >
          {item.short}
        </button>
      ))}
    </div>
  )
}
