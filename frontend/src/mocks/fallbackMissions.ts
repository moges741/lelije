import type { AppLanguage, Mission } from '../types/mission'

/**
 * Local sample missions in the Contract B shape, used only when
 * POST /api/missions is unreachable. The real library is
 * ai/missions/fallback.json (Content owner).
 * The am and om text is a draft and needs native-speaker review.
 */
type Seed = Omit<Mission, 'id' | 'language' | 'title' | 'description'> & {
  key: string
  text: Record<AppLanguage, { title: string; description: string } | null>
}

const SEEDS: Seed[] = [
  {
    key: 'star-jumps',
    type: 'physical',
    durationMin: 3,
    points: 15,
    verification: 'pose',
    goal: { detector: 'jump', count: 10 },
    ageMin: 5,
    ageMax: 13,
    tags: ['indoor', 'energy'],
    text: {
      en: {
        title: 'Star Jumps',
        description:
          'Jump 10 times like you are reaching for the stars. Stay in a clear space.',
      },
      am: {
        title: 'የኮከብ ዝላይ',
        description: 'ኮከብ እንደሚነኩ 10 ጊዜ ይዝለሉ። ነፃ ቦታ ላይ ይሁኑ።',
      },
      om: {
        title: 'Utaalcha Urjii',
        description: 'Akka urjii tuqxuutti si’a 10 utaali. Bakka bal’aa irra dhaabadhu.',
      },
    },
  },
  {
    key: 'sky-arms',
    type: 'physical',
    durationMin: 2,
    points: 12,
    verification: 'pose',
    goal: { detector: 'armsUp', count: 8 },
    ageMin: 5,
    ageMax: 13,
    tags: ['indoor', 'calm'],
    text: {
      en: {
        title: 'Sky High Arms',
        description: 'Raise both arms up high 8 times. Keep your feet on the floor.',
      },
      am: {
        title: 'እጆች ወደ ሰማይ',
        description: 'ሁለቱንም እጆች 8 ጊዜ ወደ ላይ ያንሱ። እግሮችዎ መሬት ላይ ይቆዩ።',
      },
      om: {
        title: 'Harka Gara Samii',
        description: 'Harka lamaan si’a 8 ol kaasi. Miilli kee lafa irra haa turu.',
      },
    },
  },
  {
    key: 'water-break',
    type: 'helper',
    durationMin: 2,
    points: 8,
    verification: 'self',
    ageMin: 5,
    ageMax: 13,
    tags: ['indoor', 'rest'],
    text: {
      en: {
        title: 'Water Break Hero',
        description: 'Drink a glass of water, then stretch your arms gently for one minute.',
      },
      am: {
        title: 'የውሃ ጀግና',
        description: 'አንድ ብርጭቆ ውሃ ይጠጡ፤ ከዚያ ለአንድ ደቂቃ እጆችዎን በቀስታ ይዘርጉ።',
      },
      om: {
        title: 'Gootota Bishaanii',
        description: 'Bishaan burcuqqoo tokko dhugi, achiis daqiiqaa tokkoof harka kee suuta diriirsi.',
      },
    },
  },
  {
    key: 'marching-band',
    type: 'physical',
    durationMin: 3,
    points: 10,
    verification: 'self',
    ageMin: 5,
    ageMax: 10,
    tags: ['indoor', 'energy'],
    text: {
      en: {
        title: 'Marching Band',
        description: 'March on the spot for 20 steps and count out loud.',
      },
      am: null,
      om: null,
    },
  },
  {
    key: 'catch-warm-up',
    type: 'game',
    durationMin: 2,
    points: 10,
    verification: 'pose',
    goal: { detector: 'armsUp', count: 5 },
    ageMin: 6,
    ageMax: 13,
    tags: ['indoor', 'game'],
    text: {
      en: {
        title: 'Catch Warm-Up',
        description: 'Raise your arms 5 times to get ready for Catch the Stars.',
      },
      am: null,
      om: null,
    },
  },
]

export function pickMissions(
  language: AppLanguage,
  age: number,
  count: number,
  cameraAvailable: boolean,
  day: string,
): Mission[] {
  const translated = SEEDS.filter((seed) => seed.text[language])
  const inAge = translated.filter((seed) => age >= seed.ageMin && age <= seed.ageMax)
  const pool = inAge.length ? inAge : translated

  const pose = pool.filter((seed) => seed.verification === 'pose')
  const self = pool.filter((seed) => seed.verification === 'self')
  // Contract 6.4: with a camera, at least half of the missions are pose-verified.
  const wantPose = cameraAvailable ? Math.ceil(count / 2) : 0
  const ordered = [...pose.slice(0, wantPose), ...self, ...pose.slice(wantPose)]

  return ordered.slice(0, count).map(({ key, text, ...rest }) => ({
    ...rest,
    ...text[language]!,
    language,
    id: `m_${day.replaceAll('-', '')}_${key}`,
  }))
}

/** [CONFIRM] Provisional score-to-points rule until Backend and Frontend agree. */
export function scoreToPoints(score: number): number {
  if (score <= 0) return 0
  return Math.min(50, Math.max(5, Math.floor(score / 2)))
}
