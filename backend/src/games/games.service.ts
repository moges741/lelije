import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { addisDay } from '../common/day';
import { PointsService } from '../points/points.service';
import { PrismaService } from '../prisma/prisma.service';

const LEGACY_GAME = 'catch-the-stars';
const POSE_ACTIVITY_IDS = new Set([
  'catch_the_stars',
  'squats',
  'jumping_jacks',
  'freeze_dance',
  'tree_balance',
  'eskista',
  'floor_is_lava',
  'brain_memory',
  'brain_math',
  'brain_explorer',
]);

const LEGACY_FIELDS = [
  'score',
  'starsCaught',
  'goldenCaught',
  'jumps',
  'armsUp',
  'durationMs',
] as const;

const MAX_GAME_POINTS = 30;

export interface CatalogEntry {
  id: string;
  labelKey: string;
  defaultTarget: number;
  minTarget: number;
  maxTarget: number;
  durationSec: number;
  supportsKeyboard: boolean;
  repsMeaning: string;
  minSecPerRep: number;
}

const importEsm = new Function('specifier', 'return import(specifier)') as (
  specifier: string,
) => Promise<{ getActivityCatalog: () => CatalogEntry[] }>;

let cachedCatalog: Promise<CatalogEntry[]> | null = null;

function loadPoseCatalog(): Promise<CatalogEntry[]> {
  if (!cachedCatalog) {
    const repoRoot = resolve(__dirname, '..', '..', '..');
    const url = pathToFileURL(resolve(repoRoot, 'ai', 'pose', 'catalog.js')).href;
    cachedCatalog = importEsm(url).then((mod) => mod.getActivityCatalog());
  }
  return cachedCatalog;
}

/** Score-to-points rule: 1 point per 2 score, at most 30 per game. */
export function gamePoints(score: number): number {
  return Math.min(MAX_GAME_POINTS, Math.floor(score / 2));
}

/** Keeps the six known legacy Catch-the-Stars result fields; rejects anything malformed. */
function parseLegacyResult(
  value: unknown,
): Record<(typeof LEGACY_FIELDS)[number], number> {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException('result must be an object');
  }
  const input = value as Record<string, unknown>;
  const result = {} as Record<(typeof LEGACY_FIELDS)[number], number>;
  for (const field of LEGACY_FIELDS) {
    const number = input[field];
    if (typeof number !== 'number' || !Number.isFinite(number) || number < 0) {
      throw new BadRequestException(
        `result.${field} must be a non-negative number`,
      );
    }
    result[field] = Math.round(number);
  }
  return result;
}

/** Validates real ai/pose ActivityResult payloads for all 7 body-activity games. */
function parseActivityResult(value: unknown): {
  score: number;
  reps: number;
  target: number;
  completed: boolean;
  durationSec: number;
  inputMode: 'camera' | 'keyboard';
  pointsHint: number;
} {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException('result must be an object');
  }
  const input = value as Record<string, unknown>;
  const rawScore =
    typeof input.score === 'number' && Number.isFinite(input.score) && input.score >= 0
      ? Math.round(input.score)
      : null;
  const rawReps =
    typeof input.reps === 'number' && Number.isFinite(input.reps) && input.reps >= 0
      ? Math.round(input.reps)
      : 0;
  const rawTarget =
    typeof input.target === 'number' && Number.isFinite(input.target) && input.target > 0
      ? Math.round(input.target)
      : Math.max(1, rawReps);
  if (rawScore === null) {
    throw new BadRequestException('result.score must be a non-negative number');
  }
  const durationSec =
    typeof input.duration_sec === 'number' && Number.isFinite(input.duration_sec) && input.duration_sec >= 0
      ? Math.round(input.duration_sec)
      : typeof input.durationMs === 'number' && Number.isFinite(input.durationMs) && input.durationMs >= 0
        ? Math.round(input.durationMs / 1000)
        : 0;
  const inputMode = input.input_mode === 'keyboard' ? 'keyboard' : 'camera';
  const pointsHint =
    typeof input.points === 'number' && Number.isFinite(input.points) && input.points >= 0
      ? Math.min(MAX_GAME_POINTS, Math.round(input.points))
      : gamePoints(rawScore);

  return {
    score: rawScore,
    reps: rawReps,
    target: rawTarget,
    completed: input.completed === true || rawReps >= rawTarget,
    durationSec,
    inputMode,
    pointsHint,
  };
}

@Injectable()
export class GamesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly points: PointsService,
  ) {}

  /** Returns the canonical 7-activity pose catalog from ai/pose/catalog.js. */
  async catalog() {
    const activities = await loadPoseCatalog();
    return { activities };
  }

  /** Records a game or pose-activity result; each activity awards points once per day within the daily cap. */
  async recordResult(body: unknown) {
    const input = (body ?? {}) as Record<string, unknown>;

    if (typeof input.childId !== 'string') {
      throw new BadRequestException('childId must be a string');
    }
    if (typeof input.game !== 'string') {
      throw new BadRequestException(`game must be '${LEGACY_GAME}' or a valid pose activity`);
    }

    const game = input.game;
    const isLegacy = game === LEGACY_GAME;
    if (!isLegacy && !POSE_ACTIVITY_IDS.has(game)) {
      throw new BadRequestException(`game must be '${LEGACY_GAME}'`);
    }

    let score: number;
    let computedPoints: number;
    let storedResult: Prisma.InputJsonValue;

    if (isLegacy) {
      const parsed = parseLegacyResult(input.result);
      score = parsed.score;
      computedPoints = gamePoints(parsed.score);
      storedResult = parsed;
    } else {
      const parsed = parseActivityResult(input.result);
      score = parsed.score;
      computedPoints = Math.min(MAX_GAME_POINTS, Math.max(parsed.pointsHint, gamePoints(parsed.score)));
      storedResult = parsed;
    }

    const { childId } = input;
    const child = await this.prisma.child.findUnique({
      where: { id: childId },
    });
    if (!child) throw new NotFoundException('child not found');

    const day = addisDay();

    return this.prisma.$transaction(async (tx) => {
      await this.points.lockChild(tx, childId);

      const awardedBefore = await this.points.awardedToday(tx, childId, day);
      const existing = await tx.gameResult.findUnique({
        where: { childId_day_game: { childId, day, game } },
      });
      if (existing) {
        return {
          game,
          score: existing.score,
          alreadyRecorded: true,
          pointsAwarded: 0,
          pointsToday: awardedBefore,
          dailyCap: this.points.dailyCap(),
        };
      }

      const pointsAwarded = this.points.withinCap(
        computedPoints,
        awardedBefore,
      );
      await tx.gameResult.create({
        data: {
          childId,
          day,
          game,
          score,
          points: pointsAwarded,
          result: storedResult,
        },
      });
      return {
        game,
        score,
        alreadyRecorded: false,
        pointsAwarded,
        pointsToday: awardedBefore + pointsAwarded,
        dailyCap: this.points.dailyCap(),
      };
    });
  }
}
