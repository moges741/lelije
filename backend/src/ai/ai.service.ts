import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { addisDay } from '../common/day';
import { PointsService } from '../points/points.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from '../reports/reports.service';

type Lang = 'en' | 'am' | 'om';
type Region = 'highlands' | 'rift_valley' | 'simien';

const STORY_REWARD_POINTS = 10;

interface AiMissionsModule {
  generateStoryChapter: (input: {
    age?: number;
    language?: Lang;
    region?: Region;
    chapter?: number;
    maxChapters?: number;
    choiceIndex?: number;
    previousChoice?: string | null;
    previousText?: string | null;
    companionName?: string;
    theme?: string | null;
  }) => Promise<{
    source: 'ai' | 'fallback';
    title?: string;
    text: string;
    choices: string[];
    endsWith: 'choice' | 'rest';
  }>;
  generateWeeklySummary: (input: {
    age?: number;
    language?: Lang;
    completedMissions?: number;
    exerciseSessions?: number;
    totalPoints?: number;
  }) => Promise<{
    source: 'ai' | 'fallback';
    language: Lang;
    headline: string;
    summary: string;
    suggestion: string;
  }>;
}

const importEsm = new Function('specifier', 'return import(specifier)') as (
  specifier: string,
) => Promise<AiMissionsModule>;

let cachedAi: Promise<AiMissionsModule> | null = null;

function loadAi(): Promise<AiMissionsModule> {
  if (!cachedAi) {
    const repoRoot = resolve(__dirname, '..', '..', '..');
    const url = pathToFileURL(resolve(repoRoot, 'ai', 'missions', 'index.js')).href;
    cachedAi = importEsm(url);
  }
  return cachedAi;
}

function normalizeLang(raw: unknown, fallback: Lang = 'en'): Lang {
  return raw === 'am' || raw === 'om' || raw === 'en' ? raw : fallback;
}

function normalizeRegion(raw: unknown): Region {
  return raw === 'rift_valley' || raw === 'simien' ? raw : 'highlands';
}

@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
    private readonly points: PointsService,
  ) {}

  async story(body: unknown) {
    const input = (body ?? {}) as Record<string, unknown>;
    let age = 8;
    let language: Lang = normalizeLang(input.language, 'en');

    if (typeof input.childId === 'string' && input.childId.trim()) {
      const child = await this.prisma.child.findUnique({
        where: { id: input.childId },
      });
      if (child) {
        age = child.age;
        if (!input.language) {
          language = normalizeLang(child.language, 'en');
        }
      }
    }

    const region = normalizeRegion(input.region);
    const maxChapters = input.maxChapters === 3 ? 3 : 2;
    const rawChapter = typeof input.chapter === 'number' && Number.isFinite(input.chapter)
      ? Math.round(input.chapter)
      : 1;
    const chapter = Math.max(1, Math.min(maxChapters, rawChapter));
    const choiceIndex =
      input.choiceIndex === 0 || input.choiceIndex === 1
        ? input.choiceIndex
        : undefined;
    const previousChoice =
      typeof input.previousChoice === 'string' ? input.previousChoice : null;
    const previousText =
      typeof input.previousText === 'string' ? input.previousText : null;
    const theme =
      typeof input.theme === 'string' && input.theme.trim()
        ? input.theme.trim().slice(0, 60)
        : null;
    const companionName =
      typeof input.companionName === 'string' && input.companionName.trim()
        ? input.companionName.trim().slice(0, 24)
        : 'Lomi';

    const ai = await loadAi();
    const res = await ai.generateStoryChapter({
      age,
      language,
      region,
      chapter,
      maxChapters,
      choiceIndex,
      previousChoice,
      previousText,
      companionName,
      theme,
    });
    return {
      ...res,
      title: res.title ?? `Chapter ${chapter}`,
      region,
      chapter,
      maxChapters,
      language,
      companionName,
    };
  }

  /** Awards +10 reading stars once per day per Ethiopian story region, respecting the daily cap. */
  async completeStory(body: unknown) {
    const input = (body ?? {}) as Record<string, unknown>;
    const childId = typeof input.childId === 'string' ? input.childId.trim() : '';
    if (!childId) {
      throw new BadRequestException('childId is required');
    }
    const region = normalizeRegion(input.region);
    const companionName =
      typeof input.companionName === 'string' && input.companionName.trim()
        ? input.companionName.trim().slice(0, 24)
        : 'Lomi';

    const child = await this.prisma.child.findUnique({
      where: { id: childId },
    });
    if (!child) throw new NotFoundException('child not found');

    const day = addisDay();
    const game = `story-${region}`;

    return this.prisma.$transaction(async (tx) => {
      await this.points.lockChild(tx, childId);
      const awardedBefore = await this.points.awardedToday(tx, childId, day);
      const existing = await tx.gameResult.findUnique({
        where: { childId_day_game: { childId, day, game } },
      });
      if (existing) {
        return {
          region,
          alreadyRecorded: true,
          pointsAwarded: 0,
          pointsToday: awardedBefore,
          dailyCap: this.points.dailyCap(),
        };
      }

      const pointsAwarded = this.points.withinCap(STORY_REWARD_POINTS, awardedBefore);
      await tx.gameResult.create({
        data: {
          childId,
          day,
          game,
          score: 100,
          points: pointsAwarded,
          result: {
            kind: 'story',
            region,
            companionName,
          },
        },
      });
      return {
        region,
        alreadyRecorded: false,
        pointsAwarded,
        pointsToday: awardedBefore + pointsAwarded,
        dailyCap: this.points.dailyCap(),
      };
    });
  }

  async weeklySummary(body: unknown) {
    const input = (body ?? {}) as Record<string, unknown>;
    const familyCode = typeof input.familyCode === 'string' ? input.familyCode.trim().toUpperCase() : '';
    const childId = typeof input.childId === 'string' ? input.childId.trim() : '';
    const language = normalizeLang(input.language, 'en');

    if (!familyCode || !childId) {
      throw new NotFoundException('familyCode and childId are required');
    }

    const [child, report] = await Promise.all([
      this.prisma.child.findUnique({ where: { id: childId } }),
      this.reports.report(familyCode, 7),
    ]);
    if (!child) throw new NotFoundException('child not found');

    const childStats = report.children.find((row) => row.childId === childId);
    const ai = await loadAi();
    return ai.generateWeeklySummary({
      age: child.age,
      language,
      completedMissions: childStats?.period.missionsApproved ?? 0,
      exerciseSessions: childStats?.period.gamesPlayed ?? 0,
      totalPoints: childStats?.pointsInPeriod ?? 0,
    });
  }
}
