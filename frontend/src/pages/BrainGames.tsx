import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import * as api from '../api/client'
import type { BrainGameId } from '../api/client'
import { Icon } from '../components/Icon'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { AppNav } from '../components/NavBar'
import { TalkingBuddy } from '../components/TalkingBuddy'
import { TopBar } from '../components/TopBar'
import { useApp } from '../context/app-context'
import { isVoiceSupported, speakText, stopSpeaking } from '../lib/voice'
import type { GameSaved } from '../types/api'
import type { AppLanguage } from '../types/mission'

/* ============================================================================
   Game 1: Ethiopian Pattern & Memory Match
   ============================================================================ */

interface MemoryCardDef {
  pairId: string
  symbol: string
  tone: string
  label: Record<AppLanguage, string>
}

const MEMORY_DECK_BASE: MemoryCardDef[] = [
  { pairId: 'meskel', symbol: '🌼', tone: '#fff4cf', label: { en: 'Meskel', am: 'መስቀል አበባ', om: 'Masqala' } },
  { pairId: 'krar', symbol: '🎵', tone: '#e7f5f2', label: { en: 'Krar', am: 'ክራር', om: 'Kiraara' } },
  { pairId: 'bird', symbol: '🐦', tone: '#eaf2ff', label: { en: 'Sunbird', am: 'ወፍ', om: 'Simbira' } },
  { pairId: 'coffee', symbol: '☕', tone: '#f8ece2', label: { en: 'Jebena', am: 'ጀበና', om: 'Jabanaa' } },
  { pairId: 'mountain', symbol: '⛰️', tone: '#edf6e8', label: { en: 'Simien', am: 'ሰሜን', om: 'Simeen' } },
  { pairId: 'star', symbol: '⭐', tone: '#fff1d6', label: { en: 'Star', am: 'ኮከብ', om: 'Urjii' } },
]

interface MemoryTile extends MemoryCardDef {
  uid: string
}

function buildShuffledDeck(): MemoryTile[] {
  const doubled: MemoryTile[] = [...MEMORY_DECK_BASE, ...MEMORY_DECK_BASE].map((card, idx) => ({
    ...card,
    uid: `${card.pairId}-${idx}`,
  }))
  for (let i = doubled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = doubled[i]
    doubled[i] = doubled[j]
    doubled[j] = tmp
  }
  return doubled
}

/* ============================================================================
   Game 2: Star Math Builder (age-adaptive arithmetic)
   ============================================================================ */

interface MathQuestion {
  prompt: string
  answer: number
  options: number[]
}

function buildMathQuestions(age: number): MathQuestion[] {
  const harder = age >= 9
  const questions: MathQuestion[] = []
  for (let i = 0; i < 6; i += 1) {
    let a = 2 + Math.floor(Math.random() * (harder ? 11 : 7))
    let b = 1 + Math.floor(Math.random() * (harder ? 9 : 6))
    let op: '+' | '-' | '×' = i % 3 === 1 ? '-' : '+'
    if (harder && i % 3 === 2) {
      op = '×'
      a = 2 + Math.floor(Math.random() * 6)
      b = 2 + Math.floor(Math.random() * 5)
    }
    if (op === '-' && b > a) {
      const swap = a
      a = b
      b = swap
    }
    const answer = op === '+' ? a + b : op === '-' ? a - b : a * b
    const choices = new Set<number>([answer])
    while (choices.size < 4) {
      const delta = (Math.floor(Math.random() * 7) - 3) || 1
      const candidate = Math.max(0, answer + delta)
      choices.add(candidate)
    }
    const options = Array.from(choices).sort((x, y) => x - y)
    questions.push({ prompt: `${a} ${op} ${b} = ?`, answer, options })
  }
  return questions
}

/* ============================================================================
   Game 3: Ethiopia Logic & Riddle Explorer
   ============================================================================ */

interface RiddleItem {
  q: Record<AppLanguage, string>
  options: Record<AppLanguage, string[]>
  answerIdx: number
  fact: Record<AppLanguage, string>
}

const RIDDLES: RiddleItem[] = [
  {
    q: {
      en: 'Which bright yellow Ethiopian flower blooms across green hills every September?',
      am: 'በየዓመቱ መስከረም ወር በአረንጓዴ ኮረብታዎች ላይ የሚያብበው ቢጫ አበባ የቱ ነው?',
      om: 'Abaaboon keelloon Fulbaana keessa tulluuwwan Itoophiyaa irra biqilu isa kami?',
    },
    options: {
      en: ['Meskel Daisy (Adey Abeba)', 'Cactus', 'Pine Cone'],
      am: ['አደይ አበባ', 'ቁልቋል', 'ባሕር ዛፍ'],
      om: ['Abaaboo Masqalaa (Keelloo)', 'Adaamii', 'Baargamoo'],
    },
    answerIdx: 0,
    fact: {
      en: 'Adey Abeba (Meskel daisies) welcome the sunny Ethiopian New Year!',
      am: 'አደይ አበባ የኢትዮጵያን አዲስ ዓመት በብሩህ ቀለም ይቀበላል።',
      om: 'Abaaboon Masqalaa bara haaraa Itoophiyaa ifaan simata!',
    },
  },
  {
    q: {
      en: 'Which gentle mountain animal lives ONLY in Ethiopia’s highlands?',
      am: 'በኢትዮጵያ ደጋማ ተራሮች ብቻ የሚገኘው ሰላማዊ እንስሳ የቱ ነው?',
      om: 'Bineensi nagaa gaarren Itoophiyaa keessatti qofa argamu isa kami?',
    },
    options: {
      en: ['Penguin', 'Gelada Monkey', 'Kangaroo'],
      am: ['ፔንግዊን', 'ጭላዳ ዝንጀሮ', 'ካንጋሮ'],
      om: ['Peenguwiinii', 'Jaldeessa Chilladaa', 'Kaangaaroo'],
    },
    answerIdx: 1,
    fact: {
      en: 'Gelada monkeys live high in the Simien Mountains and eat fresh grass!',
      am: 'ጭላዳ ዝንጀሮዎች በሰሜን ተራሮች ላይ በሰላም ይኖራሉ።',
      om: 'Jaldeessonni chilladaa Gaarren Simeen keessa nagaan jiraatu!',
    },
  },
  {
    q: {
      en: 'What is the smartest break after finishing a screen mission?',
      am: 'ተልዕኮህን ከጨረስክ በኋላ ምርጡ እረፍት የቱ ነው?',
      om: 'Ergama iskiriinii erga xumurtee booda boqonnaan hunda caalu isa kami?',
    },
    options: {
      en: ['Scroll endlessly for hours', 'Play outside, drink water, or help family', 'Skip sleep'],
      am: ['ለሰዓታት ስልክ ማየት', 'ውጭ መጫወት፣ ውሃ መጠጣት ወይም ቤተሰብን መርዳት', 'እንቅልፍ መተው'],
      om: ['Sa’aatii dheeraa bilbila ilaaluu', 'Alatti taphachuu, bishaan dhuguu ykn maatii gargaaruu', 'Hirriba dhiisuu'],
    },
    answerIdx: 1,
    fact: {
      en: 'Moving outside and helping family keeps both your body and brain super strong!',
      am: 'ውጭ መንቀሳቀስና ቤተሰብን መርዳት አእምሮንና ሰውነትን ጠንካራ ያደርጋል።',
      om: 'Alatti socho’uu fi maatii gargaaruun sammuu fi qaama si cimsa!',
    },
  },
  {
    q: {
      en: 'Which traditional Ethiopian stringed instrument makes gentle melodies?',
      am: 'ጣፋጭ ዜማ የሚያወጣው ባህላዊ የኢትዮጵያ የክር ሙዚቃ መሣሪያ የቱ ነው?',
      om: 'Meeshaan muuziqaa aadaa Itoophiyaa sagalee mi’aawaa kennu isa kami?',
    },
    options: {
      en: ['Krar', 'Skateboard', 'Telescope'],
      am: ['ክራር', 'ብስክሌት', 'መነጽር'],
      om: ['Kiraara', 'Biskileetii', 'Daawwitii'],
    },
    answerIdx: 0,
    fact: {
      en: 'The Krar has five or six strings and fills courtyards with cheerful music!',
      am: 'ክራር በደስታ ዜማው ቤተሰብንና ጓደኞችን ያስደስታል።',
      om: 'Kiraarri sagalee gammachiisaan maatii fi hiriyaa gammachiisa!',
    },
  },
  {
    q: {
      en: 'If you plant 3 trees on Monday and 4 more on Tuesday, how many trees did you plant?',
      am: 'ሰኞ 3 ችግኞችን ማክሰኞ ደግሞ 4 ችግኞችን ብትተክል በጠቅላላው ስንት ችግኞች ተከልክ?',
      om: 'Wiixata biqiltuu 3 fi Kibxata 4 yoo dhaabde waliigalatti meeqa dhaabde?',
    },
    options: {
      en: ['6 trees', '7 trees', '9 trees'],
      am: ['6 ችግኞች', '7 ችግኞች', '9 ችግኞች'],
      om: ['Biqiltuu 6', 'Biqiltuu 7', 'Biqiltuu 9'],
    },
    answerIdx: 1,
    fact: {
      en: '3 + 4 = 7 green trees! Great brain power!',
      am: '3 + 4 = 7 አረንጓዴ ችግኞች! ድንቅ የአእምሮ ችሎታ!',
      om: '3 + 4 = biqiltuu 7! Dandeettii sammuu gaarii!',
    },
  },
]

const COPY: Record<
  AppLanguage,
  {
    title: string
    subtitle: string
    buddyHub: string
    backToHub: string
    playNow: string
    playAgain: string
    moves: string
    matches: string
    question: string
    scoreLabel: string
    starsSaved: (n: number) => string
    alreadyToday: string
    greatJob: string
    listen: string
    next: string
    games: Record<BrainGameId, { title: string; desc: string; tag: string }>
  }
> = {
  en: {
    title: 'Brain Gym Games',
    subtitle: 'Smart, fun games that grow memory, math, and curiosity — instead of mindless scrolling.',
    buddyHub: 'Ready to power up your brain? Pick a memory, math, or Ethiopia riddle game below!',
    backToHub: 'All Brain Games',
    playNow: 'Play Game',
    playAgain: 'Play Again',
    moves: 'Moves',
    matches: 'Pairs',
    question: 'Question',
    scoreLabel: 'Score',
    starsSaved: (n) => `+${n} Brain Stars added to your Star Jar!`,
    alreadyToday: 'Great practice! You already earned today’s stars for this brain game — try another one!',
    greatJob: 'Awesome Brain Power!',
    listen: 'Listen',
    next: 'Next Question',
    games: {
      brain_memory: {
        title: 'Ethiopian Memory Match',
        desc: 'Flip cards and match 6 Ethiopian nature & culture pairs to train focus.',
        tag: 'Memory & Focus',
      },
      brain_math: {
        title: 'Star Math Builder',
        desc: 'Solve 6 quick age-friendly math puzzles to build lightning thinking.',
        tag: 'Quick Thinking',
      },
      brain_explorer: {
        title: 'Ethiopia Riddle Explorer',
        desc: 'Listen and answer 5 fun riddles about Ethiopian nature, music & habits.',
        tag: 'Logic & Culture',
      },
    },
  },
  am: {
    title: 'የአእምሮ ማጎልበቻ ጨዋታዎች',
    subtitle: 'ከንቱ ስልክ ከማየት ይልቅ ትውስታን፣ ሂሳብንና እውቀትን የሚያሳድጉ አስደሳች ጨዋታዎች።',
    buddyHub: 'አእምሮህን ለማጠንከር ዝግጁ ነህ? ከታች የትውስታ፣ የሂሳብ ወይም የእንቆቅልሽ ጨዋታ ምረጥ!',
    backToHub: 'ሁሉም የአእምሮ ጨዋታዎች',
    playNow: 'ተጫወት',
    playAgain: 'እንደገና ተጫወት',
    moves: 'እርምጃ',
    matches: 'ጥንዶች',
    question: 'ጥያቄ',
    scoreLabel: 'ነጥብ',
    starsSaved: (n) => `+${n} የአእምሮ ኮከቦች ወደ ኮከብ ቅርጫትህ ተጨምረዋል!`,
    alreadyToday: 'ጥሩ ልምምድ! ለዚህ ጨዋታ የዛሬውን ኮከብ አግኝተሃል — ሌላ ጨዋታ ሞክር!',
    greatJob: 'ድንቅ የአእምሮ ችሎታ!',
    listen: 'አዳምጥ',
    next: 'ቀጣይ ጥያቄ',
    games: {
      brain_memory: {
        title: 'የኢትዮጵያ ትውስታ ማዛመድ',
        desc: '6 የኢትዮጵያ ባህልና ተፈጥሮ ካርዶችን በማዛመድ ትኩረትህን አሳድግ።',
        tag: 'ትውስታና ትኩረት',
      },
      brain_math: {
        title: 'የኮከብ ሂሳብ ጨዋታ',
        desc: 'ፈጣን አስተሳሰብን የሚያሳድጉ 6 አስደሳች የሂሳብ ጥያቄዎችን መልስ።',
        tag: 'ፈጣን አስተሳሰብ',
      },
      brain_explorer: {
        title: 'የኢትዮጵያ እንቆቅልሽ ጉዞ',
        desc: 'ስለ ኢትዮጵያ ተፈጥሮ፣ ሙዚቃና መልካም ልምዶች 5 አስደሳች እንቆቅልሾችን መልስ።',
        tag: 'እውቀትና ባህል',
      },
    },
  },
  om: {
    title: 'Taphoota Cimina Sammuu',
    subtitle: 'Bilbila irratti yeroo gubuu mannaa yaadannoo, herregaa fi hubannoo kee guddisi.',
    buddyHub: 'Sammuu kee cimsuuf qophiidhaa? Tapha yaadannoo, herregaa yookaan hibboo filadhu!',
    backToHub: 'Taphoota Sammuu Hunda',
    playNow: 'Taphadhu',
    playAgain: 'Irra Deebi’ii Taphadhu',
    moves: 'Tarkaanfii',
    matches: 'Cimdii',
    question: 'Gaaffii',
    scoreLabel: 'Qabxii',
    starsSaved: (n) => `Urjiileen sammuu +${n} gara kuusaa kee dabalaman!`,
    alreadyToday: 'Shaakala gaarii! Tapha kanaaf har’a urjiilee argatteetta — kan biraa yaali!',
    greatJob: 'Cimina Sammuu Ajaa’ibaa!',
    listen: 'Dhaggeeffadhu',
    next: 'Gaaffii Itti Aanu',
    games: {
      brain_memory: {
        title: 'Walitti Firoomsa Yaadannoo',
        desc: 'Kaardota aadaa fi uumamaa Itoophiyaa 6 walitti firoomsuun xiyyeeffannoo guddisi.',
        tag: 'Yaadannoo',
      },
      brain_math: {
        title: 'Herrega Urjii',
        desc: 'Gaaffilee herregaa salphaa fi gammachiisaa 6 deebisi.',
        tag: 'Saffisa Yaadaa',
      },
      brain_explorer: {
        title: 'Hibboo fi Beekumsa Itoophiyaa',
        desc: 'Hibboo uumamaa, muuziqaa fi amala gaarii 5 dhaggeeffadhuutii deebisi.',
        tag: 'Beekumsaa fi Aadaa',
      },
    },
  },
}

export function BrainGames() {
  const { language, session, refreshProgress } = useApp()
  const child = session?.child ?? null
  const [activeGame, setActiveGame] = useState<BrainGameId | null>(null)
  const [savedResult, setSavedResult] = useState<GameSaved | null>(null)

  // Memory game state
  const [deck, setDeck] = useState<MemoryTile[]>(() => buildShuffledDeck())
  const [flipped, setFlipped] = useState<string[]>([])
  const [matchedPairs, setMatchedPairs] = useState<string[]>([])
  const [moves, setMoves] = useState(0)
  const [memoryDone, setMemoryDone] = useState(false)

  // Math game state
  const [mathQuestions, setMathQuestions] = useState<MathQuestion[]>(() => buildMathQuestions(child?.age ?? 8))
  const [mathIdx, setMathIdx] = useState(0)
  const [mathScore, setMathScore] = useState(0)
  const [mathFeedback, setMathFeedback] = useState<'ok' | 'try' | null>(null)
  const [mathDone, setMathDone] = useState(false)

  // Explorer riddle state
  const [riddleIdx, setRiddleIdx] = useState(0)
  const [riddlePicked, setRiddlePicked] = useState<number | null>(null)
  const [riddleScore, setRiddleScore] = useState(0)
  const [riddleDone, setRiddleDone] = useState(false)

  useEffect(() => {
    return () => {
      stopSpeaking()
    }
  }, [])

  if (!child) return null
  const copy = COPY[language]

  const awardBrainStars = async (game: BrainGameId, score: number, reps: number, target: number) => {
    const res = await api.saveBrainGameResult(child.id, game, {
      score,
      reps,
      target,
      duration_sec: 45,
      points: 15,
    })
    if (res.ok) {
      setSavedResult(res.data)
      void refreshProgress()
      if (isVoiceSupported()) {
        const line =
          res.data.pointsAwarded > 0
            ? `${copy.greatJob} ${copy.starsSaved(res.data.pointsAwarded)}`
            : copy.greatJob
        speakText(line, language)
      }
    }
  }

  const startMemory = () => {
    stopSpeaking()
    setActiveGame('brain_memory')
    setDeck(buildShuffledDeck())
    setFlipped([])
    setMatchedPairs([])
    setMoves(0)
    setMemoryDone(false)
    setSavedResult(null)
  }

  const startMath = () => {
    stopSpeaking()
    setActiveGame('brain_math')
    setMathQuestions(buildMathQuestions(child.age))
    setMathIdx(0)
    setMathScore(0)
    setMathFeedback(null)
    setMathDone(false)
    setSavedResult(null)
  }

  const startExplorer = () => {
    stopSpeaking()
    setActiveGame('brain_explorer')
    setRiddleIdx(0)
    setRiddlePicked(null)
    setRiddleScore(0)
    setRiddleDone(false)
    setSavedResult(null)
  }

  const handleTileClick = (tile: MemoryTile) => {
    if (memoryDone || flipped.length >= 2) return
    if (flipped.includes(tile.uid) || matchedPairs.includes(tile.pairId)) return

    const nextFlipped = [...flipped, tile.uid]
    setFlipped(nextFlipped)

    if (nextFlipped.length === 2) {
      setMoves((m) => m + 1)
      const first = deck.find((d) => d.uid === nextFlipped[0])
      if (first && first.pairId === tile.pairId) {
        const nextMatched = [...matchedPairs, tile.pairId]
        setMatchedPairs(nextMatched)
        setFlipped([])
        if (nextMatched.length === MEMORY_DECK_BASE.length) {
          setMemoryDone(true)
          const score = Math.max(20, 40 - moves)
          void awardBrainStars('brain_memory', score, nextMatched.length, MEMORY_DECK_BASE.length)
        }
      } else {
        window.setTimeout(() => {
          setFlipped([])
        }, 720)
      }
    }
  }

  const handleMathPick = (choice: number) => {
    if (mathDone || mathFeedback !== null) return
    const current = mathQuestions[mathIdx]
    const correct = choice === current.answer
    const nextScore = correct ? mathScore + 1 : mathScore
    setMathScore(nextScore)
    setMathFeedback(correct ? 'ok' : 'try')

    window.setTimeout(() => {
      setMathFeedback(null)
      if (mathIdx + 1 >= mathQuestions.length) {
        setMathDone(true)
        void awardBrainStars('brain_math', Math.max(16, nextScore * 6), nextScore, mathQuestions.length)
      } else {
        setMathIdx((i) => i + 1)
      }
    }, 650)
  }

  const handleRiddlePick = (idx: number) => {
    if (riddlePicked !== null || riddleDone) return
    setRiddlePicked(idx)
    const item = RIDDLES[riddleIdx]
    if (idx === item.answerIdx) {
      setRiddleScore((s) => s + 1)
    }
    if (isVoiceSupported()) {
      speakText(item.fact[language], language)
    }
  }

  const nextRiddle = () => {
    stopSpeaking()
    if (riddleIdx + 1 >= RIDDLES.length) {
      setRiddleDone(true)
      void awardBrainStars('brain_explorer', Math.max(16, riddleScore * 7), riddleScore, RIDDLES.length)
    } else {
      setRiddleIdx((i) => i + 1)
      setRiddlePicked(null)
    }
  }

  const currentMath = mathQuestions[mathIdx]
  const currentRiddle = RIDDLES[riddleIdx]

  return (
    <div className="theme-child">
      <main className="screen screen-child">
        <TopBar>
          <LanguageSwitcher />
          <Link className="icon-btn" to="/missions" aria-label="Dashboard">
            <Icon name="star" size={20} />
          </Link>
        </TopBar>

        <AppNav role="child" />

        <TalkingBuddy
          message={
            activeGame
              ? `${copy.games[activeGame].title}: ${copy.games[activeGame].desc}`
              : copy.buddyHub
          }
          action={
            activeGame ? (
              <button
                type="button"
                className="btn btn-plain btn-sm"
                onClick={() => {
                  stopSpeaking()
                  setActiveGame(null)
                }}
              >
                {copy.backToHub}
              </button>
            ) : undefined
          }
        />

        {!activeGame && (
          <>
            <header className="section-head">
              <h1 className="title">{copy.title}</h1>
              <p className="lead">{copy.subtitle}</p>
            </header>

            <section className="brain-hub-grid">
              <article className="panel brain-game-card is-teal rise">
                <span className="brain-game-tag">{copy.games.brain_memory.tag}</span>
                <h2>{copy.games.brain_memory.title}</h2>
                <p className="meta">{copy.games.brain_memory.desc}</p>
                <button type="button" className="btn btn-primary btn-block" onClick={startMemory}>
                  <Icon name="play" size={18} />
                  {copy.playNow}
                </button>
              </article>

              <article className="panel brain-game-card is-gold rise">
                <span className="brain-game-tag">{copy.games.brain_math.tag}</span>
                <h2>{copy.games.brain_math.title}</h2>
                <p className="meta">{copy.games.brain_math.desc}</p>
                <button type="button" className="btn btn-sun btn-block" onClick={startMath}>
                  <Icon name="play" size={18} />
                  {copy.playNow}
                </button>
              </article>

              <article className="panel brain-game-card is-earth rise">
                <span className="brain-game-tag">{copy.games.brain_explorer.tag}</span>
                <h2>{copy.games.brain_explorer.title}</h2>
                <p className="meta">{copy.games.brain_explorer.desc}</p>
                <button type="button" className="btn btn-primary btn-block" onClick={startExplorer}>
                  <Icon name="play" size={18} />
                  {copy.playNow}
                </button>
              </article>
            </section>
          </>
        )}

        {activeGame === 'brain_memory' && (
          <section className="panel brain-stage rise">
            <div className="split">
              <h1 className="panel-title">{copy.games.brain_memory.title}</h1>
              <div className="brain-stats">
                <span>
                  {copy.matches}: <strong>{matchedPairs.length}/{MEMORY_DECK_BASE.length}</strong>
                </span>
                <span>
                  {copy.moves}: <strong>{moves}</strong>
                </span>
              </div>
            </div>

            <div className="memory-grid">
              {deck.map((tile) => {
                const isRevealed = flipped.includes(tile.uid) || matchedPairs.includes(tile.pairId)
                const isMatched = matchedPairs.includes(tile.pairId)
                return (
                  <button
                    key={tile.uid}
                    type="button"
                    className={
                      isMatched
                        ? 'memory-tile is-matched'
                        : isRevealed
                          ? 'memory-tile is-open'
                          : 'memory-tile'
                    }
                    style={isRevealed ? { backgroundColor: tile.tone } : undefined}
                    onClick={() => handleTileClick(tile)}
                  >
                    {isRevealed ? (
                      <>
                        <span className="memory-symbol" aria-hidden="true">{tile.symbol}</span>
                        <span className="memory-label">{tile.label[language]}</span>
                      </>
                    ) : (
                      <Icon name="star" size={24} />
                    )}
                  </button>
                )
              })}
            </div>

            {memoryDone && (
              <div className="brain-win-box">
                <strong>{copy.greatJob}</strong>
                {savedResult && (
                  <p className="banner banner-ok">
                    {savedResult.pointsAwarded > 0
                      ? copy.starsSaved(savedResult.pointsAwarded)
                      : copy.alreadyToday}
                  </p>
                )}
                <div className="story-finale-actions">
                  <button type="button" className="btn btn-sun" onClick={startMemory}>
                    {copy.playAgain}
                  </button>
                  <button type="button" className="btn btn-plain" onClick={() => setActiveGame(null)}>
                    {copy.backToHub}
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {activeGame === 'brain_math' && (
          <section className="panel brain-stage rise">
            <div className="split">
              <h1 className="panel-title">{copy.games.brain_math.title}</h1>
              <div className="brain-stats">
                <span>
                  {copy.question}: <strong>{Math.min(mathIdx + 1, mathQuestions.length)}/{mathQuestions.length}</strong>
                </span>
                <span>
                  {copy.scoreLabel}: <strong>{mathScore}</strong>
                </span>
              </div>
            </div>

            {!mathDone && currentMath ? (
              <div className="math-arena">
                <div className="math-equation">{currentMath.prompt}</div>
                <div className="math-options">
                  {currentMath.options.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      className="btn btn-plain math-opt-btn"
                      disabled={mathFeedback !== null}
                      onClick={() => handleMathPick(opt)}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
                {mathFeedback && (
                  <p className={mathFeedback === 'ok' ? 'banner banner-ok' : 'banner banner-warn'}>
                    {mathFeedback === 'ok' ? '⭐ +1!' : `${currentMath.answer}`}
                  </p>
                )}
              </div>
            ) : (
              <div className="brain-win-box">
                <strong>
                  {copy.greatJob} ({mathScore}/{mathQuestions.length})
                </strong>
                {savedResult && (
                  <p className="banner banner-ok">
                    {savedResult.pointsAwarded > 0
                      ? copy.starsSaved(savedResult.pointsAwarded)
                      : copy.alreadyToday}
                  </p>
                )}
                <div className="story-finale-actions">
                  <button type="button" className="btn btn-sun" onClick={startMath}>
                    {copy.playAgain}
                  </button>
                  <button type="button" className="btn btn-plain" onClick={() => setActiveGame(null)}>
                    {copy.backToHub}
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {activeGame === 'brain_explorer' && (
          <section className="panel brain-stage rise">
            <div className="split">
              <h1 className="panel-title">{copy.games.brain_explorer.title}</h1>
              <div className="brain-stats">
                <span>
                  {copy.question}: <strong>{Math.min(riddleIdx + 1, RIDDLES.length)}/{RIDDLES.length}</strong>
                </span>
                <span>
                  {copy.scoreLabel}: <strong>{riddleScore}</strong>
                </span>
              </div>
            </div>

            {!riddleDone && currentRiddle ? (
              <div className="riddle-arena">
                <div className="split">
                  <p className="riddle-question">{currentRiddle.q[language]}</p>
                  {isVoiceSupported() && (
                    <button
                      type="button"
                      className="buddy-voice-btn"
                      onClick={() => speakText(currentRiddle.q[language], language)}
                    >
                      <Icon name="volume" size={18} />
                      <span>{copy.listen}</span>
                    </button>
                  )}
                </div>

                <div className="stack">
                  {currentRiddle.options[language].map((opt, idx) => {
                    const picked = riddlePicked === idx
                    const isRight = idx === currentRiddle.answerIdx
                    const cls =
                      riddlePicked === null
                        ? 'btn btn-plain story-choice-btn'
                        : isRight
                          ? 'btn btn-plain story-choice-btn is-correct'
                          : picked
                            ? 'btn btn-plain story-choice-btn is-wrong'
                            : 'btn btn-plain story-choice-btn'
                    return (
                      <button
                        key={opt}
                        type="button"
                        className={cls}
                        disabled={riddlePicked !== null}
                        onClick={() => handleRiddlePick(idx)}
                      >
                        <span className="story-choice-letter">{String.fromCharCode(65 + idx)}</span>
                        <span className="story-choice-text">{opt}</span>
                      </button>
                    )
                  })}
                </div>

                {riddlePicked !== null && (
                  <div className="brain-fact-box">
                    <p>{currentRiddle.fact[language]}</p>
                    <button type="button" className="btn btn-sun" onClick={nextRiddle}>
                      {copy.next}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="brain-win-box">
                <strong>
                  {copy.greatJob} ({riddleScore}/{RIDDLES.length})
                </strong>
                {savedResult && (
                  <p className="banner banner-ok">
                    {savedResult.pointsAwarded > 0
                      ? copy.starsSaved(savedResult.pointsAwarded)
                      : copy.alreadyToday}
                  </p>
                )}
                <div className="story-finale-actions">
                  <button type="button" className="btn btn-sun" onClick={startExplorer}>
                    {copy.playAgain}
                  </button>
                  <button type="button" className="btn btn-plain" onClick={() => setActiveGame(null)}>
                    {copy.backToHub}
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  )
}
