import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import * as api from '../api/client'
import { Icon, type IconName } from '../components/Icon'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { MissionCard } from '../components/MissionCard'
import { AppNav } from '../components/NavBar'
import { PinPrompt } from '../components/PinPrompt'
import { TalkingBuddy } from '../components/TalkingBuddy'
import { TopBar } from '../components/TopBar'
import { useApp } from '../context/app-context'
import { failureKey } from '../lib/failure'
import { missionState } from '../lib/progress'
import { useAutoRefresh, useRemote } from '../lib/useRemote'
import { isVoiceSupported, speakText, stopSpeaking } from '../lib/voice'
import type { AppLanguage } from '../types/mission'

interface OfflineIdea {
  id: string
  icon: IconName
  badge: Record<AppLanguage, string>
  title: Record<AppLanguage, string>
  body: Record<AppLanguage, string>
}

const OFFLINE_IDEAS: OfflineIdea[] = [
  {
    id: 'outside',
    icon: 'flame',
    badge: { en: 'Play Outside', am: 'ውጭ ተጫወት', om: 'Alatti Taphadhu' },
    title: {
      en: 'Go play outside in the fresh air!',
      am: 'ውጭ ወጥተህ በንጹህ አየር ተጫወት!',
      om: 'Alatti bahii qilleensa qulqulluu keessa taphadhu!',
    },
    body: {
      en: 'Take a 15-minute break from the screen! Run, stretch, jump rope, or kick a ball outside with friends or family.',
      am: 'ለ15 ደቂቃ ከስክሪን እረፍት ውሰድ! ውጭ ሩጥ፣ ተንጠራራ ወይም ከጓደኞችህና ከቤተሰብ ጋር ኳስ ተጫወት።',
      om: 'Daqiiqaa 15f iskiriinii irraa boqodhu! Alatti fiigi, diriiri yookaan hiriyaa fi maatii waliin kubbaa taphadhu.',
    },
  },
  {
    id: 'help',
    icon: 'family',
    badge: { en: 'Help Family', am: 'ቤተሰብን እርዳ', om: 'Maatii Gargaari' },
    title: {
      en: 'Be a helper at home today!',
      am: 'ዛሬ በቤት ውስጥ ቤተሰብህን እርዳ!',
      om: 'Har’a mana keessatti maatii kee gargaari!',
    },
    body: {
      en: 'Ask Mom, Dad, or an elder how you can help right now — tidy your toys, fold a blanket, or bring a glass of water.',
      am: 'እናትህን፣ አባትህን ወይም ታላቅህን ምን ልርዳ ብለህ ጠይቅ — መጫወቻህን ሰብስብ ወይም ውሃ አቅርብ።',
      om: 'Haadha, abbaa yookaan angafa kee akkamitti akka gargaartu gaafadhu — mana qulqulleessi yookaan bishaan dhiyeessi.',
    },
  },
  {
    id: 'cook',
    icon: 'star',
    badge: { en: 'Cook Together', am: 'አብሮ ማብሰል', om: 'Waliin Bilcheessuu' },
    title: {
      en: 'Cook a tasty meal with your family!',
      am: 'ከቤተሰብህ ጋር ጣፋጭ ምግብ አብስል!',
      om: 'Maatii kee waliin nyaata mi’aawaa qopheessi!',
    },
    body: {
      en: 'Join the kitchen safely with a grown-up! Wash vegetables, set the table, or learn how your favourite Ethiopian dish is made.',
      am: 'ከታላቅ ሰው ጋር በደህንነት ወጥ ቤት ግባ! አትክልት እጠብ፣ ጠረጴዛ አሰናዳ ወይም የሚወደደውን ምግብ እንዴት እንደሚሠራ ተማር።',
      om: 'Nama guddaa waliin nagaan kushiinaa seeni! Kuduraa dhiqi, minjaala qopheessi yookaan nyaata jaallattu baradhu.',
    },
  },
]

const POPUP_COPY: Record<
  AppLanguage,
  {
    kicker: string
    listen: string
    nextIdea: string
    willTry: string
    realWorldBtn: string
    quickTitle: string
    bodyTitle: string
    bodySub: string
    brainTitle: string
    brainSub: string
    storyTitle: string
    storySub: string
    homeLink: string
  }
> = {
  en: {
    kicker: 'Zema’s Real-World Tip',
    listen: 'Listen',
    nextIdea: 'Another Idea',
    willTry: 'I’ll Try It!',
    realWorldBtn: 'Real-World Idea',
    quickTitle: 'Smart Play & Stories',
    bodyTitle: 'Body AI Games',
    bodySub: 'Jump, dance Eskista & move with camera',
    brainTitle: 'Brain Games',
    brainSub: 'Memory, Math & Riddles instead of scrolling',
    storyTitle: 'Ethiopian Stories',
    storySub: 'Interactive voice adventures across Ethiopia',
    homeLink: 'Home',
  },
  am: {
    kicker: 'የዜማ የእውነተኛ ዓለም ምክር',
    listen: 'አዳምጥ',
    nextIdea: 'ሌላ ሀሳብ',
    willTry: 'እሞክረዋለሁ!',
    realWorldBtn: 'የውጭ ጨዋታ ሀሳብ',
    quickTitle: 'ጠቃሚ ጨዋታዎች እና ታሪኮች',
    bodyTitle: 'የሰውነት AI ጨዋታዎች',
    bodySub: 'እስክስታ፣ ዝላይና ጤናማ እንቅስቃሴ',
    brainTitle: 'የአእምሮ ጨዋታዎች',
    brainSub: 'ትውስታ፣ ሂሳብ እና የኢትዮጵያ እንቆቅልሽ',
    storyTitle: 'የኢትዮጵያ ታሪኮች',
    storySub: 'በድምፅ የሚነበቡ አስደሳች ታሪኮች',
    homeLink: 'መነሻ',
  },
  om: {
    kicker: 'Gorsa Addunyaa Dhugaa Zeemaa',
    listen: 'Dhaggeeffadhu',
    nextIdea: 'Yaada Biraa',
    willTry: 'Nan Yaala!',
    realWorldBtn: 'Yaada Alatti Taphaa',
    quickTitle: 'Taphoota Sammuu fi Seenaa',
    bodyTitle: 'Taphoota Qaamaa AI',
    bodySub: 'Utaali, Eskistaa shubbisi, socho’i',
    brainTitle: 'Taphoota Sammuu',
    brainSub: 'Yaadannoo, Herregaa fi Hibboo',
    storyTitle: 'Seenaa Itoophiyaa',
    storySub: 'Seenaa sagaleen dubbifamu filadhu',
    homeLink: 'Mana',
  },
}

const POPUP_SESSION_KEY = 'lelije.offline_tip_shown'

function buddyGreeting(
  language: AppLanguage,
  name: string,
  doneCount: number,
  total: number,
  nextTitle?: string,
): string {
  if (language === 'am') {
    if (total > 0 && doneCount >= total) {
      return `ጎበዝ ${name}! የዛሬን ተልዕኮዎች ጨርሰሃል። አሁን ውጭ ተጫወት፣ ቤተሰብን እርዳ ወይም የአእምሮ ጨዋታ ተጫወት!`
    }
    if (nextTitle) {
      return `ሰላም ${name}! ኮከብ ለማግኘት «${nextTitle}»ን ንካ ወይም አዳምጥን ተጫን።`
    }
    return `ሰላም ${name}! ከታች ያለውን ቀላል ካርድ ንካና ጀምር!`
  }
  if (language === 'om') {
    if (total > 0 && doneCount >= total) {
      return `Jabaadhu ${name}! Ergama har’aa xumurteetta. Amma alatti taphadhu yookaan Tapha Sammuu taphadhu!`
    }
    if (nextTitle) {
      return `Akkam ${name}! Urjii argachuuf “${nextTitle}” tuqi yookaan Dhaggeeffadhu tuqi.`
    }
    return `Akkam ${name}! Jalqabuuf kaardii salphaa gadii tuqi!`
  }
  if (total > 0 && doneCount >= total) {
    return `Amazing job, ${name}! All today’s quests are done. Play outside, help family, or try Brain Games!`
  }
  if (nextTitle) {
    return `Hi ${name}! Tap “${nextTitle}” below to earn stars — or tap Listen to hear any quest!`
  }
  return `Hi ${name}! Pick a quest, Body AI Game, or Brain Game below!`
}

/** Simple, joyful, uncluttered Child Dashboard tailored for ages 5–13. */
export function Missions() {
  const {
    t,
    language,
    session,
    setSession,
    signOut,
    missions,
    missionsStatus,
    missionsError,
    missionsOffline,
    reloadMissions,
    progress,
    refreshProgress,
  } = useApp()
  const navigate = useNavigate()
  const [askingPin, setAskingPin] = useState(false)
  const [ideaIndex, setIdeaIndex] = useState(() => new Date().getMinutes() % OFFLINE_IDEAS.length)
  const [showIdeaPopup, setShowIdeaPopup] = useState(() => {
    try {
      return sessionStorage.getItem(POPUP_SESSION_KEY) !== '1'
    } catch {
      return true
    }
  })

  const code = session?.family.code ?? ''
  const child = session?.child ?? null
  const childId = child?.id ?? ''
  const notes = useRemote(
    childId ? `child-notes:${childId}` : null,
    () => api.notifications(code, { audience: 'child', childId }),
    20_000,
  )

  useEffect(() => {
    void refreshProgress()
  }, [refreshProgress])

  useEffect(() => {
    return () => {
      stopSpeaking()
    }
  }, [])

  const waiting =
    progress !== null &&
    (progress.today.missionsPending.length > 0 || progress.today.playRequest?.status === 'sent')
  useAutoRefresh(waiting ? refreshProgress : null, 15_000)

  if (!session || !child) return null
  const unread = notes.data?.unread ?? 0
  const capReached = progress !== null && progress.pointsToday >= progress.dailyCap
  const capPercent =
    progress && progress.dailyCap > 0
      ? Math.min(100, Math.round((progress.pointsToday / progress.dailyCap) * 100))
      : 0
  const doneCount = missions.filter((m) => missionState(progress, m.id) === 'done').length
  const nextMission = missions.find((m) => {
    const s = missionState(progress, m.id)
    return s === 'todo' || s === 'redo'
  })
  const childName = child.nickname || t('childProfile')
  const greeting = buddyGreeting(language, childName, doneCount, missions.length, nextMission?.title)
  const copy = POPUP_COPY[language]
  const currentIdea = OFFLINE_IDEAS[ideaIndex % OFFLINE_IDEAS.length]

  const dismissPopup = () => {
    stopSpeaking()
    setShowIdeaPopup(false)
    try {
      sessionStorage.setItem(POPUP_SESSION_KEY, '1')
    } catch {
      // ignore storage errors
    }
  }

  return (
    <div className="theme-child">
      <main className="screen screen-child">
        <TopBar>
          <LanguageSwitcher />
          <Link className="icon-btn" to="/child/notifications" aria-label={t('notifications')}>
            <Icon name="bell" size={20} />
            {unread > 0 && <span className="dot">{unread}</span>}
          </Link>
        </TopBar>

        <AppNav role="child" />

        {missionsOffline && (
          <p className="banner banner-warn" role="status">
            {t('offlineBanner')}
          </p>
        )}

        <section className="child-welcome-band rise">
          <TalkingBuddy
            message={greeting}
            showAutoToggle
            action={
              <button
                type="button"
                className="btn btn-sun btn-sm"
                onClick={() => {
                  setIdeaIndex((i) => (i + 1) % OFFLINE_IDEAS.length)
                  setShowIdeaPopup(true)
                }}
              >
                <Icon name="flame" size={16} />
                {copy.realWorldBtn}
              </button>
            }
          />

          <div className="child-star-jar">
            <div className="child-star-jar-top">
              <div>
                <span className="tally-label">{childName}</span>
                <strong className="child-star-big">
                  <Icon name="star" size={24} />
                  {progress ? progress.pointsToday : '—'}
                  {progress && <small>/ {progress.dailyCap}</small>}
                </strong>
              </div>
              <div className="child-streak-box">
                <Icon name="flame" size={20} />
                <strong>{progress ? progress.streak : '—'}</strong>
                <span>{t('streak')}</span>
              </div>
            </div>
            <div
              className="cap-track is-chunky"
              role="progressbar"
              aria-label={t('pointsToday')}
              aria-valuemin={0}
              aria-valuemax={progress?.dailyCap ?? 100}
              aria-valuenow={progress?.pointsToday ?? 0}
            >
              <span className="cap-fill" style={{ width: `${capPercent}%` }} />
            </div>
            <p className="child-star-caption">
              {t('totalPoints')}: <strong>{progress ? progress.totalPoints : '—'}</strong>
            </p>
          </div>
        </section>

        {capReached && (
          <p className="banner banner-ok" role="status">
            {t('capReached')}
          </p>
        )}

        {/* Simple, crystal-clear 3-portal activity bar: Move, Think, Read */}
        <section className="child-portals-section">
          <h2 className="child-sub-heading">{copy.quickTitle}</h2>
          <div className="child-three-portals">
            <Link className="child-portal-card is-teal" to="/activities">
              <span className="mission-icon is-camera">
                <Icon name="camera" size={24} />
              </span>
              <strong>{copy.bodyTitle}</strong>
              <span>{copy.bodySub}</span>
            </Link>

            <Link className="child-portal-card is-brain" to="/child/brain">
              <span className="mission-icon is-parent">
                <Icon name="check" size={24} />
              </span>
              <strong>{copy.brainTitle}</strong>
              <span>{copy.brainSub}</span>
            </Link>

            <Link className="child-portal-card is-gold" to="/child/story">
              <span className="mission-icon is-self">
                <Icon name="flame" size={24} />
              </span>
              <strong>{copy.storyTitle}</strong>
              <span>{copy.storySub}</span>
            </Link>
          </div>
        </section>

        {/* Clean single-column mission list — zero distracting sidebars */}
        <section className="child-main">
          <div className="panel-head">
            <div className="section-head">
              <h1 className="section-title">{t('todayTitle')}</h1>
              <p className="lead">{t('todaySubtitle')}</p>
            </div>
            {missions.length > 0 && (
              <span className="section-counter">
                {doneCount} / {missions.length} {t('completed')}
              </span>
            )}
          </div>

          {missionsStatus === 'loading' ? (
            <ul className="mission-list" aria-busy="true" aria-label={t('loading')}>
              <li className="mission-card is-skeleton" />
              <li className="mission-card is-skeleton" />
              <li className="mission-card is-skeleton" />
            </ul>
          ) : missionsStatus === 'error' ? (
            <div className="empty error-card" role="alert">
              <p className="lead">{missionsError ? t(failureKey(missionsError)) : t('noMissions')}</p>
              <button type="button" className="btn btn-plain" onClick={reloadMissions}>
                {t('retry')}
              </button>
            </div>
          ) : (
            <ul className="mission-list">
              {missions.map((mission, index) => (
                <li key={mission.id} className="rise" style={{ animationDelay: `${index * 60}ms` }}>
                  <MissionCard mission={mission} state={missionState(progress, mission.id)} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <footer className="child-parent-switch">
          <Link className="text-link" to="/">
            {copy.homeLink}
          </Link>
          <span className="meta-dot" aria-hidden="true">·</span>
          <Link className="text-link" to="/child/play">
            {t('requestPlay')}
          </Link>
          <span className="meta-dot" aria-hidden="true">·</span>
          <button type="button" className="text-link" onClick={() => setAskingPin(true)}>
            {t('openParent')}
          </button>
          <span className="meta-dot" aria-hidden="true">·</span>
          <button type="button" className="text-link" onClick={signOut}>
            {t('signOut')}
          </button>
        </footer>

        {/* Gentle Pop-up Recommendation: Play Outside, Help Family, Cook with Family */}
        {showIdeaPopup && (
          <div className="offline-tip-backdrop" role="dialog" aria-modal="true" aria-labelledby="offline-tip-title">
            <div className="offline-tip-modal rise">
              <div className="offline-tip-head">
                <img src="/images/zema_guide.jpg" alt="Zema" className="offline-tip-avatar" />
                <div>
                  <span className="offline-tip-kicker">{copy.kicker}</span>
                  <strong className="offline-tip-badge">{currentIdea.badge[language]}</strong>
                </div>
                {isVoiceSupported() && (
                  <button
                    type="button"
                    className="buddy-voice-btn"
                    onClick={() =>
                      speakText(
                        `${currentIdea.title[language]} ${currentIdea.body[language]}`,
                        language,
                      )
                    }
                  >
                    <Icon name="volume" size={17} />
                    <span>{copy.listen}</span>
                  </button>
                )}
              </div>

              <h2 id="offline-tip-title" className="offline-tip-title">
                {currentIdea.title[language]}
              </h2>
              <p className="offline-tip-body">{currentIdea.body[language]}</p>

              <div className="offline-tip-pills">
                {OFFLINE_IDEAS.map((item, idx) => (
                  <button
                    key={item.id}
                    type="button"
                    className={idx === ideaIndex % OFFLINE_IDEAS.length ? 'offline-idea-tab is-on' : 'offline-idea-tab'}
                    onClick={() => setIdeaIndex(idx)}
                  >
                    <Icon name={item.icon} size={15} />
                    <span>{item.badge[language]}</span>
                  </button>
                ))}
              </div>

              <div className="offline-tip-actions">
                <button type="button" className="btn btn-sun btn-kid-cta" onClick={dismissPopup}>
                  <Icon name="check" size={18} />
                  {copy.willTry}
                </button>
                <button
                  type="button"
                  className="btn btn-plain"
                  onClick={() => setIdeaIndex((i) => (i + 1) % OFFLINE_IDEAS.length)}
                >
                  {copy.nextIdea}
                </button>
              </div>
            </div>
          </div>
        )}

        {askingPin && (
          <PinPrompt
            family={session.family}
            action={(pin) => api.parentLogin(code, pin)}
            onCancel={() => setAskingPin(false)}
            onDone={(result) => {
              setAskingPin(false)
              if (!result.ok) return
              setSession({ role: 'parent', family: result.data.family, child: null })
              navigate('/parent')
            }}
          />
        )}
      </main>
    </div>
  )
}
