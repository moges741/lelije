import { Link, useNavigate } from 'react-router-dom'
import { EditorialMedia } from '../components/EditorialMedia'
import { Icon, type IconName } from '../components/Icon'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { useApp } from '../context/app-context'
import { BRAND, BRAND_AM } from '../i18n'
import type { AppLanguage } from '../types/mission'

interface SolutionItem {
  num: string
  icon: IconName
  title: Record<AppLanguage, string>
  desc: Record<AppLanguage, string>
}

const SOLUTIONS: SolutionItem[] = [
  {
    num: '01',
    icon: 'camera',
    title: {
      en: 'Camera Movement Games',
      am: 'በካሜራ የሚሠሩ የሰውነት ጨዋታዎች',
      om: 'Taphoota Sochii Qaamaa Kaameeraan',
    },
    desc: {
      en: 'Real-time on-device pose games (Eskista, Jumps, Squats, Freeze Dance, Catch the Stars) that turn screen time into joyful physical movement with zero video stored.',
      am: 'እስክስታ፣ ዝላይ እና ሌሎች የእንቅስቃሴ ጨዋታዎች ቪዲዮ ሳይቀረጽ ልጆችን በደስታ ያንቀሳቅሳሉ።',
      om: 'Taphoota Eskistaa, utaalchaa fi sochii qaamaa viidiyoo osoo hin kuusin ijoollee sochoosan.',
    },
  },
  {
    num: '02',
    icon: 'star',
    title: {
      en: 'Real-World Missions',
      am: 'የእውነተኛ ዓለም ተልዕኮዎች',
      om: 'Ergama Addunyaa Dhugaa',
    },
    desc: {
      en: 'Daily offline quests encouraging kids to play outside, cook with family, read books, and help at home — plus brain-building memory, math, and riddle games.',
      am: 'ልጆች ውጭ እንዲጫወቱ፣ ከቤተሰብ ጋር ምግብ እንዲያበስሉ፣ እንዲያነቡና ቤተሰብን እንዲረዱ የሚያበረታቱ ተልዕኮዎች።',
      om: 'Ijoolleen alatti akka taphatan, maatii waliin akka bilcheessanii fi gargaaran kan jajjabeessu.',
    },
  },
  {
    num: '03',
    icon: 'flame',
    title: {
      en: 'AI Personalization',
      am: 'በAI የተዘጋጀ የግል ምክር',
      om: 'Qophii Dhuunfaa AI',
    },
    desc: {
      en: 'Adaptive missions, interactive Ethiopian adventure stories, and weekly parent summaries tailored to each child’s age and language (English, Amharic, Afaan Oromo).',
      am: 'ለልጁ ዕድሜና ቋንቋ (አማርኛ፣ ኦሮምኛ፣ እንግሊዝኛ) የተዘጋጁ ተልዕኮዎች፣ ታሪኮችና ሳምንታዊ የወላጅ ማጠቃለያዎች።',
      om: 'Ergama, seenaa Itoophiyaa fi gabaasa torbanii umrii fi afaan daa’imaaf mijate.',
    },
  },
  {
    num: '04',
    icon: 'family',
    title: {
      en: 'Parent Dashboard & Notifications',
      am: 'የወላጅ ዳሽቦርድ እና ማሳወቂያዎች',
      om: 'Daashboordii Maatii fi Beeksisoota',
    },
    desc: {
      en: 'Calm parent workspace to approve real-world missions, answer play-time requests, receive real-time alerts, and track healthy weekly progress across all children.',
      am: 'ወላጆች ተልዕኮዎችን የሚያጸድቁበት፣ የጨዋታ ጊዜ ጥያቄዎችን የሚመልሱበትና የልጆችን እድገት የሚከታተሉበት ንጹህ ዳሽቦርድ።',
      om: 'Bakka maatiin ergama itti mirkaneessu, gaaffii taphaa deebisuu fi guddina daa’immanii hordofu.',
    },
  },
  {
    num: '05',
    icon: 'shield',
    title: {
      en: 'Tracking & Restriction of Adult Content & Apps',
      am: 'ጎጂ ይዘቶችንና መተግበሪያዎችን መቆጣጠርና መገደብ',
      om: 'Hordoffii fi Daangessuu Qabiyyee Hin Mijanneefi Moosaajii',
    },
    desc: {
      en: 'Safe child-only space with PIN-protected parent controls, daily star caps, guided play approvals, and protection against adult content and distracting apps.',
      am: 'በPIN የተጠበቀ የወላጅ ቁጥጥር፣ የዕለት ገደብ እና ልጆችን ከአዋቂ ይዘቶችና ከአላስፈላጊ መተግበሪያዎች የሚጠብቅ ሥርዓት።',
      om: 'Eegumsa PIN maatiitiin kan deeggarame, daangaa guyyaa fi qabiyyee hin taane irraa daa’imman kan eegu.',
    },
  },
]

const PURPOSE_COPY: Record<
  AppLanguage,
  {
    eyebrow: string
    heading: string
    body: string
    solutionTitle: string
    goParentDash: string
    goChildDash: string
    parentEntry: string
    childEntry: string
  }
> = {
  en: {
    eyebrow: 'Project Purpose',
    heading: 'Turning passive scrolling into healthy movement, real-world family habits, and brain growth.',
    body: 'LeLije is built for Ethiopian families with children ages 5–13. Instead of endless passive screen time and unsafe apps, our system guides children to move their bodies, help their families, sharpen their minds, and stay protected under parent supervision.',
    solutionTitle: 'Our 5-Part Solution',
    goParentDash: 'Go to Parent Dashboard',
    goChildDash: 'Go to Child Dashboard',
    parentEntry: 'Parent Dashboard',
    childEntry: 'Child Dashboard',
  },
  am: {
    eyebrow: 'የፕሮጀክቱ ዓላማ',
    heading: 'ከንቱ የስክሪን ጊዜን ወደ ጤናማ እንቅስቃሴ፣ የቤተሰብ ትብብር እና የአእምሮ እድገት መቀየር።',
    body: 'ለልጄ ከ5–13 ዓመት ለሆኑ የኢትዮጵያ ልጆች የተዘጋጀ ነው። ልጆች ጊዜያቸውን በማይጠቅሙ መተግበሪያዎች ከማባከን ይልቅ እንዲንቀሳቀሱ፣ ቤተሰብን እንዲረዱ፣ አእምሯቸውን እንዲያሳድጉና በወላጅ ቁጥጥር ሥር ደህንነታቸው እንዲጠበቅ ያደርጋል።',
    solutionTitle: 'የእኛ 5 ዋና መፍትሔዎች',
    goParentDash: 'ወደ ወላጅ ዳሽቦርድ ሂድ',
    goChildDash: 'ወደ ልጅ ዳሽቦርድ ሂድ',
    parentEntry: 'የወላጅ ዳሽቦርድ',
    childEntry: 'የልጅ ዳሽቦርድ',
  },
  om: {
    eyebrow: 'Kaayyoo Piroojektichaa',
    heading: 'Yeroo iskiriinii gatii hin qabne gara sochii fayyaa, gargaarsa maatii fi guddina sammuutti jijjiiruu.',
    body: 'LeLije maatiiwwan Itoophiyaa ijoollee umrii 5–13 qabaniif ijaarame. Daa’imman bilbila irratti yeroo gubuu mannaa qaama isaanii akka sochoosan, maatii akka gargaaran, sammuu isaanii akka cimsanii fi eegumsa maatii jala akka jiraatan gargaara.',
    solutionTitle: 'Furmaata Keenya Gurguddoo 5',
    goParentDash: 'Gara Daashboordii Maatii',
    goChildDash: 'Gara Daashboordii Daa’imaa',
    parentEntry: 'Daashboordii Maatii',
    childEntry: 'Daashboordii Daa’imaa',
  },
}

export function Welcome() {
  const { t, language, session, signOut } = useApp()
  const navigate = useNavigate()

  const isParent = session?.role === 'parent'
  const isChild = session?.role === 'child' && Boolean(session.child)
  const resumeTo = isChild ? '/missions' : isParent ? '/parent' : null
  const identityLabel = isChild
    ? `${session?.child?.nickname || t('childProfile')} · ${session?.family.name}`
    : isParent
      ? `${session?.family.name} · ${t('roleParent')}`
      : null
  const copy = PURPOSE_COPY[language]

  return (
    <main className="welcome">
      <header className="welcome-bar">
        <Link className="wordmark" to="/">
          {BRAND}
        </Link>
        <div className="welcome-bar-end">
          <LanguageSwitcher />
          {resumeTo ? (
            <>
              <Link className="btn btn-primary btn-sm" to={resumeTo}>
                <Icon name={isParent ? 'family' : 'child'} size={16} />
                <span>{isParent ? copy.goParentDash : copy.goChildDash}</span>
              </Link>
              <span className="welcome-session-chip">
                <span>{identityLabel}</span>
              </span>
              <button type="button" className="welcome-signin" onClick={signOut}>
                {t('signOut')}
              </button>
            </>
          ) : (
            <Link className="welcome-signin" to="/login">
              {t('signIn')}
            </Link>
          )}
        </div>
      </header>

      <section className="welcome-grid">
        <div className="welcome-copy rise">
          <p className="welcome-amharic" lang="am">
            {BRAND_AM}
          </p>
          <h1 className="welcome-headline">{t('heroHeadline')}</h1>
          <p className="welcome-support">{t('heroSupport')}</p>

          {resumeTo ? (
            <div className="welcome-actions">
              <Link className="btn btn-primary welcome-resume" to={resumeTo}>
                <Icon name="play" size={18} />
                {isParent ? copy.goParentDash : copy.goChildDash}
              </Link>
              <button type="button" className="btn btn-plain" onClick={signOut}>
                {t('signOut')}
              </button>
            </div>
          ) : (
            <>
              <div className="welcome-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => navigate('/login')}
                >
                  <Icon name="family" size={18} />
                  {copy.parentEntry}
                </button>
                <button
                  type="button"
                  className="btn btn-sun"
                  onClick={() => navigate('/register/child')}
                >
                  <Icon name="child" size={18} />
                  {copy.childEntry}
                </button>
              </div>
              <div className="welcome-sub-actions">
                <button
                  type="button"
                  className="text-link"
                  onClick={() => navigate('/register/family')}
                >
                  {t('ctaCreateFamily')}
                </button>
                <span className="meta-dot" aria-hidden="true">·</span>
                <Link className="text-link" to="/login">
                  {t('haveAccount')}
                </Link>
              </div>
            </>
          )}

          <div className="welcome-foot">
            <p className="welcome-privacy">
              <Icon name="shield" size={16} />
              <span>{t('privacyNote')}</span>
            </p>
          </div>
        </div>

        <div className="welcome-visual rise" style={{ animationDelay: '90ms' }}>
          <div className="welcome-art-frame">
            <EditorialMedia
              src="/images/hero_kids_movement.jpg"
              alt={t('heroArtAlt')}
              className="welcome-art-img"
              fallbackIcon="star"
              fallbackTone="light"
            />
          </div>
        </div>
      </section>

      <section className="welcome-purpose rise" aria-labelledby="purpose-heading">
        <div className="welcome-purpose-head">
          <span className="welcome-eyebrow">{copy.eyebrow}</span>
          <h2 id="purpose-heading" className="welcome-purpose-title">
            {copy.heading}
          </h2>
          <p className="welcome-purpose-body">{copy.body}</p>
        </div>

        <div className="welcome-solutions-block">
          <h3 className="welcome-solutions-heading">{copy.solutionTitle}</h3>
          <ol className="welcome-solution-grid">
            {SOLUTIONS.map((item) => (
              <li key={item.num} className="welcome-solution-card">
                <div className="welcome-solution-top">
                  <span className="welcome-solution-num">{item.num}</span>
                  <span className="welcome-solution-icon" aria-hidden="true">
                    <Icon name={item.icon} size={20} />
                  </span>
                </div>
                <strong>{item.title[language]}</strong>
                <p>{item.desc[language]}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </main>
  )
}
