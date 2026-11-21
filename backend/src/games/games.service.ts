import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { addisDay } from '../common/day';
import { PointsService } from '../points/points.service';
import { PrismaService } from '../prisma/prisma.service';

const GAME = 'catch-the-stars';
const RESULT_FIELDS = [
  'score',
  'starsCaught',
  'goldenCaught',
  'jumps',
  'armsUp',
  'durationMs',
] as const;
const MAX_GAME_POINTS = 30;

/** Score-to-points rule: 1 point per 2 score, at most 30 per game. */
export function gamePoints(score: number): number {
  return Math.min(MAX_GAME_POINTS, Math.floor(score / 2));
}

/** Keeps the six known result fields (section 5.3 of the contract); rejects anything malformed. */
function parseResult(value: unknown): Record<(typeof RESULT_FIELDS)[number], number> {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException('result must be an object');
  }
  const input = value as Record<string, unknown>;
  const result = {} as Record<(typeof RESULT_FIELDS)[number], number>;
  for (const field of RESULT_FIELDS) {
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

@Injectable()
export class GamesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly points: PointsService,
  ) {}

  /** Records a game result; only a child's first result of the day earns points. */
  async recordResult(body: unknown) {
    const input = (body ?? {}) as Record<string, unknown>;

    if (typeof input.childId !== 'string') {
      throw new BadRequestException('childId must be a string');
    }
    if (input.game !== GAME) {
      throw new BadRequestException(`game must be '${GAME}'`);
    }
    const result = parseResult(input.result);
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
        where: { childId_day_game: { childId, day, game: GAME } },
      });
      if (existing) {
        return {
          game: GAME,
          score: existing.score,
          alreadyRecorded: true,
          pointsAwarded: 0,
          pointsToday: awardedBefore,
          dailyCap: this.points.dailyCap(),
        };
      }

      const pointsAwarded = this.points.withinCap(
        gamePoints(result.score),
        awardedBefore,
      );
      await tx.gameResult.create({
        data: {
          childId,
          day,
          game: GAME,
          score: result.score,
          points: pointsAwarded,
          result,
        },
      });
      return {
        game: GAME,
        score: result.score,
        alreadyRecorded: false,
        pointsAwarded,
        pointsToday: awardedBefore + pointsAwarded,
        dailyCap: this.points.dailyCap(),
      };
    });
  }
}
