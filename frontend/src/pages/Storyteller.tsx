import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import * as api from '../api/client'
import { Icon } from '../components/Icon'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { AppNav } from '../components/NavBar'
import { StatusPill } from '../components/Status'
import { TalkingBuddy } from '../components/TalkingBuddy'
import { TopBar } from '../components/TopBar'
import { useApp } from '../context/app-context'
import { isVoiceSupported, readVoiceAutoPref, speakText, stopSpeaking } from '../lib/voice'
import type { StoryChapter, StoryCompleted, StoryRegion } from '../types/api'
import type { AppLanguage } from '../types/mission'

interface RegionMeta {
  id: StoryRegion
  image: string
  name: Record<AppLanguage, string>
  desc: Record<AppLanguage, string>
}

const REGIONS: RegionMeta[] = [
  {
    id: 'highlands',
    image: '/images/story_highlands.jpg',
    name: { en: 'Ethiopian Highlands', am: 'የኢትዮጵያ ደጋማ ቦታዎች', om: 'Baddaa Itoophiyaa' },
    desc: {
      en: 'Green terraced hills, Meskel daisies, and morning songs.',
      am: 'አረንጓዴ ኮረብታዎች፣ የመስቀል አበቦች እና የጠዋት ዜማ።',
      om: 'Tulluuwwan magariisaa, abaaboo Masqalaa fi faarfannaa ganamaa.',
    },
  },
  {
    id: 'rift_valley',
    image: '/images/story_rift_valley.jpg',
    name: { en: 'Rift Valley Lakes', am: 'የስምጥ ሸለቆ ሐይቆች', om: 'Haroo Sulula Qiinxamaa' },
    desc: {
      en: 'Sparkling lakes, pink flamingos, and reed boats.',
      am: 'የሚያብረቀርቁ ሐይቆች፣ ሮዝ ፍላሚንጎዎች እና የደንገል ጀልባዎች።',
      om: 'Haroo calaqqisaa, simbirroota filaamingoo fi bidiruu shomboqqoo.',
    },
  },
  {
    id: 'simien',
    image: '/images/story_simien.jpg',
    name: { en: 'Simien Mountains', am: 'የሰሜን ተራሮች', om: 'Gaarren Simeen' },
    desc: {
      en: 'Cloud-high peaks, gentle geladas, and mountain echoes.',
      am: 'ደመና የሚነኩ ተራሮች፣ ሰላማዊ ጭላዳዎች እና የተራራ ማሚቶ።',
      om: 'Fiixee gaarrenii, jaldeessota chilladaa fi sagalee gaaraa.',
    },
  },
]

interface CompanionOption {
  name: string
  role: Record<AppLanguage, string>
}

const COMPANIONS: CompanionOption[] = [
  { name: 'Lomi', role: { en: 'Sunbird', am: 'ትንሽ ወፍ', om: 'Simbira' } },
  { name: 'Zema', role: { en: 'Hoopoe', am: 'ሁፖ ወፍ', om: 'Hiriyaa' } },
  { name: 'Buna', role: { en: 'Highland Fox', am: 'ቀበሮ', om: 'Jeedala' } },
  { name: 'Kora', role: { en: 'Gelada', am: 'ጭላዳ', om: 'Chilladaa' } },
]

interface SparkOption {
  id: string
  prompt: string
  label: Record<AppLanguage, string>
}

const SPARKS: SparkOption[] = [
  { id: 'music', prompt: 'krar music and happy clapping', label: { en: 'Music & Krar', am: 'ሙዚቃና ክራር', om: 'Muuziqaa fi Kiraara' } },
  { id: 'animals', prompt: 'friendly Ethiopian animals and birds', label: { en: 'Friendly Animals', am: 'ተግባቢ እንስሳት', om: 'Bineensota Gaarii' } },
  { id: 'flowers', prompt: 'golden Meskel flowers and nature', label: { en: 'Meskel Flowers', am: 'የመስቀል አበቦች', om: 'Abaaboo Masqalaa' } },
  { id: 'stars', prompt: 'stargazing and counting bright skies', label: { en: 'Starry Skies', am: 'ኮከቦችና ሰማይ', om: 'Urjiilee fi Samii' } },
]

const UI_COPY: Record<
  AppLanguage,
  {
    title: string
    pickFriend: string
    pickPlace: string
    pickSpark: string
    optional: string
    startStory: string
    chapterWord: string
    ofWord: string
    readAloud: string
    stopReading: string
    youChose: string
    whatNext: string
    aiBadge: string
    safeBadge: string
    storyDoneTitle: string
    storyDoneBody: string
    claimStars: string
    claiming: string
    starsEarned: (n: number) => string
    alreadyEarnedToday: string
    tryOtherPath: string
    nextPlace: string
    goArena: string
    changeSetup: string
    loadError: string
    listenOption: string
    step1: string
    step2: string
    step3: string
  }
> = {
  en: {
    title: 'Ethiopian Adventure Stories',
    pickFriend: '1. Choose your story friend',
    pickPlace: '2. Choose a place in Ethiopia',
    pickSpark: '3. Add a story spark',
    optional: 'optional',
    startStory: 'Start Adventure',
    chapterWord: 'Chapter',
    ofWord: 'of',
    readAloud: 'Read aloud',
    stopReading: 'Stop',
    youChose: 'You chose',
    whatNext: 'What happens next? Tap your choice!',
    aiBadge: 'AI Story',
    safeBadge: 'Ethiopian Tale',
    storyDoneTitle: 'Story Complete!',
    storyDoneBody: 'What a wonderful journey! Collect your reading stars or explore another path.',
    claimStars: 'Collect +10 Reading Stars',
    claiming: 'Saving stars…',
    starsEarned: (n) => `+${n} Reading Stars added to your Star Jar!`,
    alreadyEarnedToday: 'You already collected stars for this region today — try another place for more!',
    tryOtherPath: 'Try the Other Path',
    nextPlace: 'Explore Another Place',
    goArena: 'Move in Body AI Arena',
    changeSetup: 'Change place & friend',
    loadError: 'Could not load that chapter right now. Tap to try again.',
    listenOption: 'Listen to choice',
    step1: 'Arrival',
    step2: 'Discovery',
    step3: 'Happy Ending',
  },
  am: {
    title: 'የኢትዮጵያ የጀብዱ ታሪኮች',
    pickFriend: '1. የታሪክ ጓደኛህን ምረጥ',
    pickPlace: '2. በኢትዮጵያ ውስጥ ቦታ ምረጥ',
    pickSpark: '3. የታሪክ ሀሳብ ጨምር',
    optional: 'አማራጭ',
    startStory: 'ታሪኩን ጀምር',
    chapterWord: 'ምዕራፍ',
    ofWord: 'ከ',
    readAloud: 'አንብብልኝ',
    stopReading: 'አቁም',
    youChose: 'የመረጥከው',
    whatNext: 'ቀጥሎ ምን ይሁን? ምርጫህን ንካ!',
    aiBadge: 'AI ታሪክ',
    safeBadge: 'የኢትዮጵያ ታሪክ',
    storyDoneTitle: 'ታሪኩ ተጠናቀቀ!',
    storyDoneBody: 'ድንቅ ጉዞ ነበር! የንባብ ኮከቦችህን ሰብስብ ወይም ሌላ መንገድ ሞክር።',
    claimStars: '+10 የንባብ ኮከቦችን ሰብስብ',
    claiming: 'ኮከቦችን በማስቀመጥ ላይ…',
    starsEarned: (n) => `+${n} የንባብ ኮከቦች ወደ ኮከብ ቅርጫትህ ተጨምረዋል!`,
    alreadyEarnedToday: 'ለዚህ ቦታ የዛሬውን ኮከብ አግኝተሃል — ለተጨማሪ ሌላ ቦታ ሞክር!',
    tryOtherPath: 'ሌላውን መንገድ ሞክር',
    nextPlace: 'ሌላ ቦታ ጎብኝ',
    goArena: 'ወደ Body AI ጨዋታዎች ሂድ',
    changeSetup: 'ቦታና ጓደኛ ቀይር',
    loadError: 'ምዕራፉን አሁን መጫን አልተቻለም። እባክህ እንደገና ሞክር።',
    listenOption: 'ምርጫውን አዳምጥ',
    step1: 'መጀመሪያ',
    step2: 'ግኝት',
    step3: 'ደስተኛ መጨረሻ',
  },
  om: {
    title: 'Seenaa Imala Itoophiyaa',
    pickFriend: '1. Hiriyaa seenaa kee filadhu',
    pickPlace: '2. Bakka Itoophiyaa filadhu',
    pickSpark: '3. Yaada seenaa dabali',
    optional: 'filannoo',
    startStory: 'Seenaa Jalqabi',
    chapterWord: 'Boqonnaa',
    ofWord: 'keessaa',
    readAloud: 'Naaf dubbisi',
    stopReading: 'Dhaabi',
    youChose: 'Kan filatte',
    whatNext: 'Itti aansee maaltu ta’a? Filannoo kee tuqi!',
    aiBadge: 'Seenaa AI',
    safeBadge: 'Seenaa Itoophiyaa',
    storyDoneTitle: 'Seenaan Xumurameera!',
    storyDoneBody: 'Imala bareedaa ture! Urjiilee dubbisaa kee fudhadhu yookaan karaa biraa yaali.',
    claimStars: 'Urjiilee Dubbisaa +10 Fudhadhu',
    claiming: 'Urjiilee olkaa’aa jira…',
    starsEarned: (n) => `Urjiileen dubbisaa +${n} gara kuusaa kee dabalaman!`,
    alreadyEarnedToday: 'Har’aaf bakka kanaaf urjiilee argatteetta — bakka biraa yaali!',
    tryOtherPath: 'Karaa Biraa Yaali',
    nextPlace: 'Bakka Biraa Daawwadhu',
    goArena: 'Gara Tapha Body AI Deemi',
    changeSetup: 'Bakka fi hiriyaa jijjiiri',
    loadError: 'Boqonnaa kana amma fe’uun hin danda’amne. Irra deebi’ii yaali.',
    listenOption: 'Filannoo dhaggeeffadhu',
    step1: 'Jalqaba',
    step2: 'Argannoo',
    step3: 'Xumura Gammachiisaa',
  },
}

interface RenderedChapter extends StoryChapter {
  chosenLabel?: string
}

export function Storyteller() {
  const { language, session, refreshProgress } = useApp()
  const child = session?.child ?? null
  const [region, setRegion] = useState<StoryRegion>('highlands')
  const [companion, setCompanion] = useState<string>('Lomi')
  const [sparkId, setSparkId] = useState<string | null>(null)
  const [chapters, setChapters] = useState<RenderedChapter[]>([])
  const [loading, setLoading] = useState(false)
  const [readingKey, setReadingKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [rewardState, setRewardState] = useState<'idle' | 'saving' | 'done'>('idle')
  const [rewardResult, setRewardResult] = useState<StoryCompleted | null>(null)
  const [setupOpen, setSetupOpen] = useState(true)
  const [storyLang, setStoryLang] = useState<AppLanguage>(language)
  const latestRef = useRef<HTMLDivElement | null>(null)

  // Stop speech cleanly when unmounting the storyteller screen.
  useEffect(() => {
    return () => {
      stopSpeaking()
    }
  }, [])

  // Reset active story chapters cleanly when the child switches language.
  if (storyLang !== language) {
    setStoryLang(language)
    stopSpeaking()
    setReadingKey(null)
    setError(null)
    if (chapters.length > 0) {
      setChapters([])
      setRewardState('idle')
      setRewardResult(null)
      setSetupOpen(true)
    }
  }

  if (!child) return null

  const copy = UI_COPY[language]
  const activeRegion = REGIONS.find((r) => r.id === region) ?? REGIONS[0]
  const activeSpark = SPARKS.find((s) => s.id === sparkId) ?? null
  const latest = chapters[chapters.length - 1] ?? null

  const speakWithKey = (key: string, text: string) => {
    if (readingKey === key) {
      stopSpeaking()
      setReadingKey(null)
      return
    }
    speakText(text, language, {
      onStart: () => setReadingKey(key),
      onEnd: () => setReadingKey((cur) => (cur === key ? null : cur)),
    })
  }

  const loadChapter = async (opts: {
    nextRegion: StoryRegion
    chapter: 1 | 2 | 3
    choiceIndex?: 0 | 1
    previousChoice?: string
    previousText?: string
    companionName?: string
  }) => {
    stopSpeaking()
    setReadingKey(null)
    setLoading(true)
    setError(null)
    if (opts.chapter === 1) {
      setRewardState('idle')
      setRewardResult(null)
      setSetupOpen(false)
    }

    const usedCompanion = opts.companionName ?? companion
    const res = await api.generateStory({
      childId: child.id,
      language,
      region: opts.nextRegion,
      chapter: opts.chapter,
      maxChapters: 3,
      choiceIndex: opts.choiceIndex,
      previousChoice: opts.previousChoice ?? null,
      previousText: opts.previousText ?? null,
      companionName: usedCompanion,
      theme: activeSpark?.prompt ?? null,
    })

    setLoading(false)
    if (!res.ok) {
      setError(copy.loadError)
      if (opts.chapter === 1) setSetupOpen(true)
      return
    }

    const nextEntry: RenderedChapter = {
      ...res.data,
      chosenLabel: opts.previousChoice,
    }
    const nextChapters = opts.chapter === 1 ? [nextEntry] : [...chapters, nextEntry]
    setChapters(nextChapters)

    // Scroll smoothly to the new chapter once rendered.
    requestAnimationFrame(() => {
      latestRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })

    // Auto-read aloud if the child turned on Zema's Auto-voice preference.
    if (readVoiceAutoPref() && isVoiceSupported()) {
      const chapKey = `chapter-${nextChapters.length - 1}`
      const narration = res.data.title ? `${res.data.title}. ${res.data.text}` : res.data.text
      speakText(narration, language, {
        onStart: () => setReadingKey(chapKey),
        onEnd: () => setReadingKey((cur) => (cur === chapKey ? null : cur)),
      })
    }
  }

  const claimReadingStars = async () => {
    if (rewardState !== 'idle') return
    setRewardState('saving')
    const res = await api.completeStory({
      childId: child.id,
      region,
      companionName: companion,
    })
    if (res.ok) {
      setRewardResult(res.data)
      setRewardState('done')
      void refreshProgress()
      if (res.data.pointsAwarded > 0 && isVoiceSupported()) {
        speakText(copy.starsEarned(res.data.pointsAwarded), language)
      }
    } else {
      setRewardState('idle')
      setError(copy.loadError)
    }
  }

  const exploreNextRegion = () => {
    const idx = REGIONS.findIndex((r) => r.id === region)
    const next = REGIONS[(idx + 1) % REGIONS.length]
    setRegion(next.id)
    void loadChapter({ nextRegion: next.id, chapter: 1 })
  }

  const buddyPrompt =
    chapters.length === 0
      ? language === 'am'
        ? `ሰላም ${child.nickname}! ጓደኛህንና የኢትዮጵያን ቦታ ምረጥና አብረን ታሪክ እንስማ!`
        : language === 'om'
          ? `Akkam ${child.nickname}! Hiriyaa fi bakka Itoophiyaa filadhuutii seenaa haa dhaggeeffannu!`
          : `Hi ${child.nickname}! Pick a friend and a place in Ethiopia, and let’s go on an interactive story!`
      : latest?.endsWith === 'rest'
        ? language === 'am'
          ? `በጣም ጎበዝ ${child.nickname}! ታሪኩን ጨርሰሃል። የንባብ ኮከቦችህን ውሰድ!`
          : language === 'om'
            ? `Baay’ee gaarii ${child.nickname}! Seenaa xumurteetta. Urjiilee dubbisaa kee fudhadhu!`
            : `Amazing job, ${child.nickname}! You finished the adventure with ${companion}. Collect your reading stars!`
        : language === 'am'
          ? `ምዕራፍ ${latest?.chapter ?? 1}ን አዳምጥና ቀጥሎ ምን እንደሚሆን ምረጥ!`
          : language === 'om'
            ? `Boqonnaa ${latest?.chapter ?? 1} dhaggeeffadhuutii waan itti aanu filadhu!`
            : `Listen to Chapter ${latest?.chapter ?? 1}, then tap what ${companion} should do next!`

  const currentChapterNum = latest?.chapter ?? 0

  return (
    <div className="theme-child">
      <main className="screen screen-child">
        <TopBar>
          <LanguageSwitcher />
          <Link className="icon-btn" to="/child/settings" aria-label="Settings">
            <Icon name="settings" size={20} />
          </Link>
        </TopBar>

        <AppNav role="child" />

        <TalkingBuddy message={buddyPrompt} showAutoToggle />

        <header className="section-head">
          <h1 className="title">{copy.title}</h1>
          {chapters.length > 0 && !setupOpen && (
            <button
              type="button"
              className="btn btn-plain"
              onClick={() => {
                stopSpeaking()
                setReadingKey(null)
                setSetupOpen(true)
              }}
            >
              {copy.changeSetup}
            </button>
          )}
        </header>

        {(setupOpen || chapters.length === 0) && (
          <section className="story-setup-stack">
            <div className="panel story-picker-panel">
              <h2 className="panel-title">{copy.pickFriend}</h2>
              <div className="story-companion-grid">
                {COMPANIONS.map((item) => {
                  const selected = companion === item.name
                  return (
                    <button
                      key={item.name}
                      type="button"
                      className={selected ? 'story-chip-card is-on' : 'story-chip-card'}
                      onClick={() => setCompanion(item.name)}
                    >
                      <strong>{item.name}</strong>
                      <span>{item.role[language]}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="panel story-picker-panel">
              <h2 className="panel-title">{copy.pickPlace}</h2>
              <div className="story-regions">
                {REGIONS.map((item) => {
                  const selected = region === item.id
                  const speakKey = `region-${item.id}`
                  return (
                    <div key={item.id} className={selected ? 'story-region-card is-on' : 'story-region-card'}>
                      <button
                        type="button"
                        className="story-region-select"
                        onClick={() => {
                          setRegion(item.id)
                          void loadChapter({ nextRegion: item.id, chapter: 1 })
                        }}
                      >
                        <div className="story-region-art">
                          <img src={item.image} alt={item.name[language]} loading="lazy" />
                        </div>
                        <div className="story-region-copy">
                          <strong>{item.name[language]}</strong>
                          <span>{item.desc[language]}</span>
                        </div>
                      </button>
                      {isVoiceSupported() && (
                        <button
                          type="button"
                          className={
                            readingKey === speakKey
                              ? 'story-region-speak is-active'
                              : 'story-region-speak'
                          }
                          aria-label={`${copy.readAloud}: ${item.name[language]}`}
                          onClick={() =>
                            speakWithKey(speakKey, `${item.name[language]}. ${item.desc[language]}`)
                          }
                        >
                          <Icon name={readingKey === speakKey ? 'volumeOff' : 'volume'} size={18} />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="panel story-picker-panel">
              <div className="split">
                <h2 className="panel-title">{copy.pickSpark}</h2>
                <span className="meta">{copy.optional}</span>
              </div>
              <div className="story-sparks">
                {SPARKS.map((spark) => {
                  const selected = sparkId === spark.id
                  return (
                    <button
                      key={spark.id}
                      type="button"
                      className={selected ? 'story-spark-btn is-on' : 'story-spark-btn'}
                      onClick={() => setSparkId((cur) => (cur === spark.id ? null : spark.id))}
                    >
                      {spark.label[language]}
                    </button>
                  )
                })}
              </div>
              <button
                type="button"
                className="btn btn-sun btn-kid-cta"
                disabled={loading}
                onClick={() => void loadChapter({ nextRegion: region, chapter: 1 })}
              >
                <Icon name="play" size={18} />
                {copy.startStory}: {activeRegion.name[language]}
              </button>
            </div>
          </section>
        )}

        {error && (
          <div className="banner banner-warn">
            <p>{error}</p>
          </div>
        )}

        {chapters.length > 0 && (
          <section className="story-book-stage">
            <div className="story-scene-banner">
              <img src={activeRegion.image} alt={activeRegion.name[language]} />
              <div className="story-scene-overlay">
                <div className="story-scene-meta">
                  <strong>{activeRegion.name[language]}</strong>
                  <span>{companion}</span>
                </div>
                <ol className="story-progress-steps" aria-label="Story progress">
                  {[
                    { num: 1, label: copy.step1 },
                    { num: 2, label: copy.step2 },
                    { num: 3, label: copy.step3 },
                  ].map((step) => {
                    const done = currentChapterNum > step.num || (currentChapterNum === 3 && step.num === 3)
                    const active = currentChapterNum === step.num
                    return (
                      <li
                        key={step.num}
                        className={
                          done
                            ? 'story-step is-done'
                            : active
                              ? 'story-step is-active'
                              : 'story-step'
                        }
                      >
                        <span className="story-step-dot">{step.num}</span>
                        <span>{step.label}</span>
                      </li>
                    )
                  })}
                </ol>
              </div>
            </div>

            {chapters.map((chap, idx) => {
              const chapKey = `chapter-${idx}`
              const isLatest = idx === chapters.length - 1
              const narration = chap.title ? `${chap.title}. ${chap.text}` : chap.text
              return (
                <article
                  key={`${chap.region}-${chap.chapter}-${idx}`}
                  ref={isLatest ? latestRef : undefined}
                  className="panel story-card rise"
                >
                  {chap.chosenLabel && (
                    <div className="story-chosen-banner">
                      <Icon name="check" size={16} />
                      <span>
                        <strong>{copy.youChose}:</strong> {chap.chosenLabel}
                      </span>
                    </div>
                  )}

                  <div className="split">
                    <div className="story-card-head">
                      <span className="story-chapter-kicker">
                        {copy.chapterWord} {chap.chapter} {copy.ofWord} {chap.maxChapters ?? 3}
                      </span>
                      <h2 className="panel-title">{chap.title ?? `${copy.chapterWord} ${chap.chapter}`}</h2>
                    </div>
                    <div className="story-card-actions">
                      {isVoiceSupported() && (
                        <button
                          type="button"
                          className={
                            readingKey === chapKey ? 'buddy-voice-btn is-active' : 'buddy-voice-btn'
                          }
                          onClick={() => speakWithKey(chapKey, narration)}
                        >
                          <Icon name={readingKey === chapKey ? 'volumeOff' : 'volume'} size={17} />
                          <span>{readingKey === chapKey ? copy.stopReading : copy.readAloud}</span>
                        </button>
                      )}
                      <StatusPill tone="info">
                        {chap.source === 'ai' ? copy.aiBadge : copy.safeBadge}
                      </StatusPill>
                    </div>
                  </div>
                  <p className="story-prose">{chap.text}</p>
                </article>
              )
            })}
          </section>
        )}

        {loading && (
          <div className="skeleton-stack">
            <div className="skeleton-card" />
          </div>
        )}

        {latest && !loading && latest.endsWith === 'choice' && latest.choices.length > 0 && (
          <section className="panel story-choices-panel rise">
            <h2 className="panel-title">{copy.whatNext}</h2>
            <div className="stack">
              {latest.choices.map((choice, cIdx) => {
                const optionKey = `choice-${latest.chapter}-${cIdx}`
                const nextChap = Math.min(3, latest.chapter + 1) as 2 | 3
                return (
                  <div key={choice} className="story-choice-row">
                    <button
                      type="button"
                      className="btn btn-plain story-choice-btn"
                      onClick={() =>
                        void loadChapter({
                          nextRegion: region,
                          chapter: nextChap,
                          choiceIndex: cIdx === 1 ? 1 : 0,
                          previousChoice: choice,
                          previousText: latest.text,
                        })
                      }
                    >
                      <span className="story-choice-letter">{cIdx === 0 ? 'A' : 'B'}</span>
                      <span className="story-choice-text">{choice}</span>
                    </button>
                    {isVoiceSupported() && (
                      <button
                        type="button"
                        className={
                          readingKey === optionKey
                            ? 'quest-speak-btn is-active'
                            : 'quest-speak-btn'
                        }
                        aria-label={`${copy.listenOption} ${cIdx === 0 ? 'A' : 'B'}`}
                        onClick={() => speakWithKey(optionKey, choice)}
                      >
                        <Icon name={readingKey === optionKey ? 'volumeOff' : 'volume'} size={20} />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {latest && !loading && latest.endsWith === 'rest' && (
          <section className="panel story-finale-card rise">
            <div className="story-finale-head">
              <span className="story-finale-star" aria-hidden="true">
                <Icon name="star" size={32} />
              </span>
              <div>
                <h2 className="panel-title">{copy.storyDoneTitle}</h2>
                <p className="meta">{copy.storyDoneBody}</p>
              </div>
            </div>

            {rewardState !== 'done' ? (
              <button
                type="button"
                className="btn btn-sun btn-kid-cta"
                disabled={rewardState === 'saving'}
                onClick={() => void claimReadingStars()}
              >
                <Icon name="star" size={18} />
                {rewardState === 'saving' ? copy.claiming : copy.claimStars}
              </button>
            ) : rewardResult ? (
              <p className="banner banner-ok">
                {rewardResult.pointsAwarded > 0
                  ? copy.starsEarned(rewardResult.pointsAwarded)
                  : copy.alreadyEarnedToday}
              </p>
            ) : null}

            <div className="story-finale-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={exploreNextRegion}
              >
                {copy.nextPlace}
              </button>
              <button
                type="button"
                className="btn btn-plain"
                onClick={() => void loadChapter({ nextRegion: region, chapter: 1 })}
              >
                {copy.tryOtherPath}
              </button>
              <Link className="btn btn-plain" to="/activities">
                {copy.goArena}
              </Link>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
