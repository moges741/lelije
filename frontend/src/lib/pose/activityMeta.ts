import type { IconName } from '../../components/Icon'
import type { AppLanguage } from '../../types/mission'
import type { ActivityId, KeyboardAction } from './types'

export interface ActivityMeta {
  id: ActivityId
  icon: IconName
  movement: Record<AppLanguage, string>
  title: Record<AppLanguage, string>
  desc: Record<AppLanguage, string>
  controls: { action: KeyboardAction; label: string; keyHint: string; hold?: boolean }[]
}

export const ACTIVITY_META: Record<ActivityId, ActivityMeta> = {
  catch_the_stars: {
    id: 'catch_the_stars',
    icon: 'star',
    movement: { en: 'Jump + Arms Up', am: 'ዝላይ + እጅ ማንሳት', om: 'Utaaluu + Harka Ol' },
    title: { en: 'Catch the Stars', am: 'ኮከቦችን ያዝ', om: 'Urjiiwwan Qabi' },
    desc: {
      en: 'Jump for golden stars and lift both arms high to catch clouds in real time.',
      am: 'ወርቃማ ኮከቦችን ለመያዝ ዝለሉ፤ ደመናዎችን ለመያዝ እጆቻችሁን ከፍ አድርጉ።',
      om: 'Urjii warqee qabuuf utaali; duumessa qabuuf harka kee ol kaasi.',
    },
    controls: [
      { action: 'jump', label: 'Jump', keyHint: 'Space / J' },
      { action: 'armsUp', label: 'Arms Up', keyHint: 'A' },
    ],
  },
  squats: {
    id: 'squats',
    icon: 'jump',
    movement: { en: 'Deep Squats', am: 'ጉልበት መታጠፍ', om: 'Jilba Dachaa’uu' },
    title: { en: 'Squat Power', am: 'የስኳት ኃይል', om: 'Humna Squat' },
    desc: {
      en: 'Bend your knees low and stand up tall — MediaPipe tracks every full squat.',
      am: 'ጉልበትዎን ዝቅ አድርገው ቁሙ — ካሜራ AI እያንዳንዱን ስኳት ይቆጥራል።',
      om: 'Jilba kee gad qabii ol ka’i — kaameeraan AI hunda ni lakkaa’a.',
    },
    controls: [{ action: 'squat', label: 'Squat', keyHint: 'S / ↓' }],
  },
  jumping_jacks: {
    id: 'jumping_jacks',
    icon: 'arms',
    movement: { en: 'Full-Body Jacks', am: 'ሙሉ ሰውነት ዝላይ', om: 'Utaalcha Qaama Guutuu' },
    title: { en: 'Jumping Jacks', am: 'ጃምፒንግ ጃክስ', om: 'Jumping Jacks' },
    desc: {
      en: 'Jump wide with hands high overhead, then land feet together to score combos.',
      am: 'እጆችዎን ወደ ላይ እና እግሮችዎን ከፍተው ይዝለሉ።',
      om: 'Harka ol kaastee miila bantee utaali.',
    },
    controls: [{ action: 'jumpingJack', label: 'Jumping Jack', keyHint: 'X / Space' }],
  },
  freeze_dance: {
    id: 'freeze_dance',
    icon: 'play',
    movement: { en: 'Dance & Freeze', am: 'ጭፈራ እና መቆም', om: 'Shubbisii Dhaabbadhu' },
    title: { en: 'Freeze Dance', am: 'ፍሪዝ ዳንስ', om: 'Shubbisa Dhaabbii' },
    desc: {
      en: 'Dance with high energy when the beat plays, then freeze completely still like a statue!',
      am: 'ሙዚቃው ሲኖር ይጨፍሩ፤ “ቁም!” ሲል እንደ ሐውልት ቀጥ ብለው ይቁሙ።',
      om: 'Yeroo sirbaa shubbisi; yeroo “Dhaabbadhu!” jedhu hin socho’in!',
    },
    controls: [{ action: 'move', label: 'Dance Move', keyHint: 'Hold M', hold: true }],
  },
  tree_balance: {
    id: 'tree_balance',
    icon: 'child',
    movement: { en: 'One-Leg Balance', am: 'በአንድ እግር ሚዛን', om: 'Madaallii Miila Tokkoo' },
    title: { en: 'Tree Balance', am: 'የዛፍ ሚዛን', om: 'Madaallii Mukaa' },
    desc: {
      en: 'Lift one foot and hold your balance steady like a tall highland tree.',
      am: 'አንድ እግርዎን ከፍ አድርገው እንደ ረጅም ዛፍ ሚዛንዎን ይጠብቁ።',
      om: 'Miila tokko ol fuudhii akka mukaa madaallii kee eeggadhu.',
    },
    controls: [{ action: 'balance', label: 'Hold Balance', keyHint: 'Hold B', hold: true }],
  },
  eskista: {
    id: 'eskista',
    icon: 'flame',
    movement: { en: 'Shoulder Beats', am: 'የትከሻ እስክስታ', om: 'Sochii Gateettii' },
    title: { en: 'Eskista Dance', am: 'እስክስታ ዳንስ', om: 'Shubbisa Iskistaa' },
    desc: {
      en: 'Bounce your shoulders to the Ethiopian rhythm — AI detects every shoulder beat!',
      am: 'በኢትዮጵያ ምት ትከሻዎን ያንቀሳቅሱ — AI እያንዳንዱን ምት ይለያል።',
      om: 'Rukuttaa Itoophiyaatiin gateettii kee sochoosi!',
    },
    controls: [{ action: 'move', label: 'Shoulder Beat', keyHint: 'Tap M' }],
  },
  floor_is_lava: {
    id: 'floor_is_lava',
    icon: 'shield',
    movement: { en: 'Jump & Duck', am: 'ዝላይ እና ጎንበስ', om: 'Utaali & Gad Jedhi' },
    title: { en: 'Floor is Lava', am: 'ወለሉ እሳት ነው', om: 'Lafti Ibidda' },
    desc: {
      en: 'Jump over incoming lava waves and squat low under overhead beams to keep your hearts.',
      am: 'በእሳት ማዕበል ላይ ይዝለሉ፤ ከላይ ባሉት እንቅፋቶች ሥር ጎንበስ ይበሉ።',
      om: 'Dambalii ibiddaa irra utaali; wanta mataa olii jala gad jedhi.',
    },
    controls: [
      { action: 'jump', label: 'Jump Lava', keyHint: 'Space / J' },
      { action: 'squat', label: 'Duck Beam', keyHint: 'Hold S / ↓', hold: true },
    ],
  },
}

export const ORDERED_ACTIVITY_IDS: ActivityId[] = [
  'catch_the_stars',
  'eskista',
  'squats',
  'jumping_jacks',
  'freeze_dance',
  'tree_balance',
  'floor_is_lava',
]

export function activityDisplayName(game: string | undefined, language: AppLanguage): string {
  if (!game) return ACTIVITY_META.catch_the_stars.title[language]
  const normalized = game.replace(/-/g, '_') as ActivityId
  const meta = ACTIVITY_META[normalized]
  return meta ? meta.title[language] : game
}
