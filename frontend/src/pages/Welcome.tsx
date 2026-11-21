import { Link, useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { KidsScene } from '../components/KidsScene'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { useApp } from '../context/app-context'
import { BRAND, BRAND_AM } from '../i18n'

const HERO_STARS = [
  { left: '8%', size: 22, delay: '0s', duration: '7s' },
  { left: '24%', size: 14, delay: '2.4s', duration: '9s' },
  { left: '41%', size: 18, delay: '4.6s', duration: '8s' },
  { left: '63%', size: 26, delay: '1.2s', duration: '7.5s' },
  { left: '79%', size: 16, delay: '3.4s', duration: '9.5s' },
  { left: '92%', size: 20, delay: '5.8s', duration: '8.5s' },
]

export function Welcome() {
  const { t, session } = useApp()
  const navigate = useNavigate()

  // The home page always shows. A saved session adds a Continue button instead of redirecting.
  const resumeTo =
    session?.role === 'child' && session.child ? '/missions' : session?.role === 'parent' ? '/parent' : null

  return (
    <main className="hero">
      <div className="hero-scene" aria-hidden="true">
        <span className="hero-sun" />
        <span className="hero-cloud hero-cloud-left" />
        <span className="hero-cloud hero-cloud-right" />
        {HERO_STARS.map((star) => (
          <span
            key={star.left}
            className="hero-star"
            style={{
              left: star.left,
              animationDelay: star.delay,
              animationDuration: star.duration,
            }}
          >
            <Icon name="star" size={star.size} />
          </span>
        ))}
        <svg className="hero-hill hero-hill-back" viewBox="0 0 400 200" preserveAspectRatio="none">
          <path d="M0 70C80 20 150 30 220 60s120 40 180-10v150H0z" />
        </svg>
        <svg className="hero-hill hero-hill-front" viewBox="0 0 400 200" preserveAspectRatio="none">
          <path d="M0 80C90 30 180 40 260 70s100 30 140 0v130H0z" />
        </svg>
      </div>

      <header className="hero-top">
        <LanguageSwitcher />
      </header>

      <div className="hero-copy">
        <p className="hero-brand">
          <span>{BRAND}</span>
          <span className="hero-brand-am" lang="am">
            {BRAND_AM}
          </span>
        </p>
        <h1 className="hero-headline">{t('heroHeadline')}</h1>
        <p className="hero-support">{t('heroSupport')}</p>
      </div>

      <div className="hero-actions">
        {resumeTo && (
          <Link className="btn btn-sun hero-cta hero-resume" to={resumeTo}>
            {t('continueSession')}
          </Link>
        )}
        <button type="button" className="btn btn-sun hero-cta" onClick={() => navigate('/register/family')}>
          {t('ctaCreateFamily')}
        </button>
        <button type="button" className="btn btn-plain hero-cta" onClick={() => navigate('/register/child')}>
          {t('ctaJoinFamily')}
        </button>
        <Link className="hero-login" to="/login">
          {t('haveAccount')}
        </Link>
      </div>

      <div className="hero-art">
        <KidsScene label={t('heroArtAlt')} />
      </div>
    </main>
  )
}
