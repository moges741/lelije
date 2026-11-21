import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { addisDay } from '../common/day';
import { PointsService } from '../points/points.service';
import { PrismaService } from '../prisma/prisma.service';
import { MissionsService } from './missions.service';

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
    private readonly missions: MissionsService,
  ) {}

  /**
   * Records a mission as done, once per day. Camera-verified completions are
   * approved and paid at once; tap-to-confirm ones wait for a parent. A
   * rejected completion can be redone; any other repeat changes nothing.
   */
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
    const mission = await this.missions.findMission(childId, day, missionId);
    if (!mission) {
      throw new NotFoundException("mission not found in today's missions");
    }
    if (verifiedBy === 'pose' && mission.verification !== 'pose') {
      throw new BadRequestException(
        'this mission cannot be verified by pose',
      );
    }
    const status = verifiedBy === 'pose' ? 'approved' : 'pending';

    return this.prisma.$transaction(async (tx) => {
      await this.points.lockChild(tx, childId);

      const awardedBefore = await this.points.awardedToday(tx, childId, day);
      const existing = await tx.completion.findUnique({
        where: { childId_missionId_day: { childId, missionId, day } },
      });
      if (existing && existing.status !== 'rejected') {
        return {
          completionId: existing.id,
          missionId,
          verifiedBy: existing.verifiedBy,
          status: existing.status,
          alreadyCompleted: true,
          pointsAwarded: 0,
          pointsToday: awardedBefore,
          dailyCap: this.points.dailyCap(),
        };
      }

      const pointsAwarded =
        status === 'approved'
          ? this.points.withinCap(mission.points, awardedBefore)
          : 0;
      const data = {
        status,
        points: pointsAwarded,
        verifiedBy,
        result: result ?? Prisma.DbNull,
        completedAt: new Date(),
        reviewedAt: null,
      };
      const saved = existing
        ? await tx.completion.update({ where: { id: existing.id }, data })
        : await tx.completion.create({
            data: { childId, missionId, day, ...data },
          });

      return {
        completionId: saved.id,
        missionId,
        verifiedBy,
        status,
        alreadyCompleted: false,
        pointsAwarded,
        pointsToday: awardedBefore + pointsAwarded,
        dailyCap: this.points.dailyCap(),
      };
    });
  }
}
