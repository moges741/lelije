import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { addisDay } from '../common/day';
import { Mission, MissionsInput, MissionsResult } from './missions.types';

type Lang = 'en' | 'am' | 'om';

interface AiMission {
  title: string;
  description: string;
  category?: string;
  type?: string;
  interaction?: string;
  points?: number;
  duration_sec?: number | null;
  needs_parent?: boolean;
}

interface AiModule {
  generateMissions: (input: {
    age: number;
    language: Lang;
    count: number;
    interests?: string[];
    types?: Array<'solo' | 'family' | 'outdoor'>;
    includeExercise?: boolean;
  }) => Promise<{
    source: 'ai' | 'fallback' | 'mixed' | 'mock';
    languageFallback?: boolean;
    missions: AiMission[];
  }>;
  loadFallbackMissions: () => Record<Lang, AiMission[]>;
}

// Keep native ESM dynamic import intact when NestJS compiles to CommonJS.
const importEsm = new Function('specifier', 'return import(specifier)') as (
  specifier: string,
) => Promise<AiModule>;

let cachedAiModule: Promise<AiModule> | null = null;

function loadAiModule(): Promise<AiModule> {
  if (!cachedAiModule) {
    const repoRoot = resolve(__dirname, '..', '..', '..');
    const entryUrl = pathToFileURL(resolve(repoRoot, 'ai', 'missions', 'index.js')).href;
    cachedAiModule = importEsm(entryUrl);
  }
  return cachedAiModule;
}

function normalizeLanguage(language: string): Lang {
  return language === 'am' || language === 'om' ? language : 'en';
}

function clampAge(age: number): number {
  return Math.max(5, Math.min(13, Math.round(Number.isFinite(age) ? age : 8)));
}

function poseTarget(detector: 'jump' | 'armsUp', age: number): number {
  if (detector === 'jump') {
    if (age <= 6) return 6;
    if (age <= 9) return 8;
    return 10;
  }
  if (age <= 6) return 6;
  if (age <= 9) return 8;
  return 10;
}

function localizedPoseMissions(lang: Lang, age: number, space: string): Omit<Mission, 'id'>[] {
  const jumps = poseTarget('jump', age);
  const arms = poseTarget('armsUp', age);
  const spaceTag = space === 'outdoor-yard' ? 'outdoor' : 'indoor';

  if (lang === 'am') {
    return [
      {
        title: 'የኮከብ ዝላይ',
        description: `ነፃ ቦታ ላይ ቆመው ወደ ሰማይ ${jumps} ጊዜ ይዝለሉ።`,
        type: 'physical',
        durationMin: 3,
        points: 15,
        verification: 'pose',
        goal: { detector: 'jump', count: jumps },
        language: 'am',
        ageMin: 5,
        ageMax: 13,
        tags: [spaceTag, 'energy'],
      },
      {
        title: 'ሰማይን ንካ',
        description: `ሁለቱንም እጆችዎን ከጭንቅላትዎ በላይ ${arms} ጊዜ ከፍ ያድርጉ።`,
        type: 'physical',
        durationMin: 2,
        points: 12,
        verification: 'pose',
        goal: { detector: 'armsUp', count: arms },
        language: 'am',
        ageMin: 5,
        ageMax: 13,
        tags: [spaceTag, 'stretch'],
      },
    ];
  }

  if (lang === 'om') {
    return [
      {
        title: 'Utaalcha Urjii',
        description: `Bakka bal'aa keessatti gara samiitti si'a ${jumps} utaali.`,
        type: 'physical',
        durationMin: 3,
        points: 15,
        verification: 'pose',
        goal: { detector: 'jump', count: jumps },
        language: 'om',
        ageMin: 5,
        ageMax: 13,
        tags: [spaceTag, 'energy'],
      },
      {
        title: 'Samii Tuqi',
        description: `Harka kee lamaan mataa kee ol si'a ${arms} ol kaasi.`,
        type: 'physical',
        durationMin: 2,
        points: 12,
        verification: 'pose',
        goal: { detector: 'armsUp', count: arms },
        language: 'om',
        ageMin: 5,
        ageMax: 13,
        tags: [spaceTag, 'stretch'],
      },
    ];
  }

  return [
    {
      title: 'Star Jumps',
      description: `Jump ${jumps} times like you are reaching for the stars in a clear space.`,
      type: 'physical',
      durationMin: 3,
      points: 15,
      verification: 'pose',
      goal: { detector: 'jump', count: jumps },
      language: 'en',
      ageMin: 5,
      ageMax: 13,
      tags: [spaceTag, 'energy'],
    },
    {
      title: 'Touch the Sky',
      description: `Lift both arms high above your head ${arms} times.`,
      type: 'physical',
      durationMin: 2,
      points: 12,
      verification: 'pose',
      goal: { detector: 'armsUp', count: arms },
      language: 'en',
      ageMin: 5,
      ageMax: 13,
      tags: [spaceTag, 'stretch'],
    },
  ];
}

function classifyContractType(raw: AiMission): Mission['type'] {
  const text = `${raw.title} ${raw.description}`.toLowerCase();
  if (raw.category === 'exercise' || /jump|hop|stretch|walk|dance|move|run/.test(text)) {
    return 'physical';
  }
  if (/tidy|clean|help|fold|thank|family|sort|water/.test(text)) {
    return 'helper';
  }
  if (/draw|story|sing|song|write|craft|paint|poem/.test(text)) {
    return 'creative';
  }
  return 'game';
}

function toContractBMission(
  raw: AiMission,
  lang: Lang,
  space: string,
  index: number,
  datePart: string,
): Mission {
  const durationMin =
    typeof raw.duration_sec === 'number' && raw.duration_sec > 0
      ? Math.max(1, Math.min(15, Math.round(raw.duration_sec / 60)))
      : 5;
  const points =
    typeof raw.points === 'number' && Number.isFinite(raw.points)
      ? Math.max(5, Math.min(25, Math.round(raw.points)))
      : 15;
  const spaceTag = space === 'outdoor-yard' ? 'outdoor' : 'indoor';
  const tags = [spaceTag];
  if (raw.type) tags.push(raw.type);
  if (raw.needs_parent) tags.push('family');

  return {
    id: `m_${datePart}_${index}`,
    title: raw.title.trim(),
    description: raw.description.trim(),
    type: classifyContractType(raw),
    durationMin,
    points,
    verification: 'self',
    language: lang,
    ageMin: 5,
    ageMax: 13,
    tags,
  };
}

function extractInterests(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const list = raw
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());
  return list.length > 0 ? list : undefined;
}

/**
 * Connects NestJS to the real `ai/missions/index.js` module (Gemini-first with
 * automatic fallback.json safety net) and adapts results to Contract B.
 */
export async function generateContractBMissions(
  input: MissionsInput,
): Promise<MissionsResult> {
  const lang = normalizeLanguage(input.language);
  const age = clampAge(input.age);
  const count = Math.max(1, Math.min(5, Math.round(input.count || 3)));
  const datePart = addisDay().replaceAll('-', '');
  const types: Array<'solo' | 'family' | 'outdoor'> =
    input.space === 'outdoor-yard' ? ['solo', 'family', 'outdoor'] : ['solo', 'family'];

  const posePool = input.cameraAvailable ? localizedPoseMissions(lang, age, input.space) : [];
  // Keep at least one real-world self-verified mission so parents always have items to review.
  const poseCount = input.cameraAvailable ? Math.min(posePool.length, Math.max(0, count - 1)) : 0;
  const aiNeeded = Math.max(1, count - poseCount);

  const warnings: string[] = [];
  let aiSource: 'ai' | 'fallback' | 'mixed' = 'fallback';
  let rawRealWorld: AiMission[] = [];

  try {
    const ai = await loadAiModule();
    const res = await ai.generateMissions({
      age,
      language: lang,
      count: aiNeeded,
      interests: extractInterests(input.interests),
      types,
      includeExercise: false,
    });
    rawRealWorld = Array.isArray(res.missions) ? res.missions : [];
    aiSource = res.source === 'ai' ? 'ai' : res.source === 'mixed' ? 'mixed' : 'fallback';
    if (res.languageFallback) warnings.push('language_fallback');
  } catch (err) {
    warnings.push(err instanceof Error ? err.message : 'ai_module_fallback');
    try {
      const ai = await loadAiModule();
      const all = ai.loadFallbackMissions();
      rawRealWorld = (all[lang] ?? all.en ?? []).slice(0, aiNeeded);
    } catch {
      rawRealWorld = [];
    }
    aiSource = 'fallback';
  }

  const missions: Mission[] = [];

  for (let i = 0; i < poseCount; i += 1) {
    const base = posePool[i];
    missions.push({
      ...base,
      id: `m_${datePart}_${missions.length}`,
    });
  }

  for (const raw of rawRealWorld) {
    if (missions.length >= count) break;
    if (!raw?.title || !raw?.description) continue;
    missions.push(toContractBMission(raw, lang, input.space, missions.length, datePart));
  }

  // Last-resort safety net so the child never receives fewer than `count` missions.
  if (missions.length < count) {
    const extras = localizedPoseMissions(lang, age, input.space);
    for (const extra of extras) {
      if (missions.length >= count) break;
      missions.push({
        ...extra,
        id: `m_${datePart}_${missions.length}`,
      });
    }
  }

  return {
    missions: missions.slice(0, count),
    source: aiSource,
    warnings,
  };
}
