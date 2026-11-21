import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { addisDay } from '../common/day';
import { PointsService } from '../points/points.service';
import { PrismaService } from '../prisma/prisma.service';
import { Mission } from './missions.types';

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/** Keeps only the two known fields of a pose result; rejects anything malformed. */
function parseResult(value: unknown) {
  if (value == null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException('result must be an object');
  }
  const { count, durationMs } = value as Record<string, unknown>;
  if (
    (count !== undefined && !isCount(count)) ||
    (durationMs !== undefined && !isCount(durationMs))
  ) {
    throw new BadRequestException(
      'result.count and result.durationMs must be non-negative numbers',
    );
  }
  return { count, durationMs };
}

@Injectable()
export class CompletionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly points: PointsService,
  ) {}

  /** Awards a mission's stored points once per day; a repeat changes nothing. */
  async complete(body: unknown) {
    const input = (body ?? {}) as Record<string, unknown>;

    if (typeof input.childId !== 'string') {
      throw new BadRequestException('childId must be a string');
    }
    if (typeof input.missionId !== 'string') {
      throw new BadRequestException('missionId must be a string');
    }
    if (input.verifiedBy !== 'pose' && input.verifiedBy !== 'self') {
      throw new BadRequestException("verifiedBy must be 'pose' or 'self'");
    }
    // The server's clock decides the day; completedAt is only checked for shape.
    if (
      input.completedAt != null &&
      (typeof input.completedAt !== 'string' ||
        Number.isNaN(Date.parse(input.completedAt)))
    ) {
      throw new BadRequestException('completedAt must be a date string');
    }
    const result = parseResult(input.result);
    const { childId, missionId, verifiedBy } = input;

    const child = await this.prisma.child.findUnique({
      where: { id: childId },
    });
    if (!child) throw new NotFoundException('child not found');

    const day = addisDay();
    const daily = await this.prisma.dailyMission.findUnique({
      where: { childId_day: { childId, day } },
    });
    const mission = (daily?.missions as unknown as Mission[] | undefined)?.find(
      (candidate) => candidate.id === missionId,
    );
    if (!mission) {
      throw new NotFoundException("mission not found in today's missions");
    }
    if (verifiedBy === 'pose' && mission.verification !== 'pose') {
      throw new BadRequestException(
        'this mission cannot be verified by pose',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await this.points.lockChild(tx, childId);

      const awardedBefore = await this.points.awardedToday(tx, childId, day);
      const existing = await tx.completion.findUnique({
        where: { childId_missionId_day: { childId, missionId, day } },
      });
      if (existing) {
        return {
          missionId,
          verifiedBy: existing.verifiedBy,
          alreadyCompleted: true,
          pointsAwarded: 0,
          pointsToday: awardedBefore,
          dailyCap: this.points.dailyCap(),
        };
      }

      const pointsAwarded = this.points.withinCap(mission.points, awardedBefore);
      await tx.completion.create({
        data: { childId, missionId, day, points: pointsAwarded, verifiedBy, result },
      });
      return {
        missionId,
        verifiedBy,
        alreadyCompleted: false,
        pointsAwarded,
        pointsToday: awardedBefore + pointsAwarded,
        dailyCap: this.points.dailyCap(),
      };
    });
  }
}
