import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FamiliesService } from '../families/families.service';
import { MissionsService } from '../missions/missions.service';
import { PointsService } from '../points/points.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly points: PointsService,
    private readonly families: FamiliesService,
    private readonly missions: MissionsService,
  ) {}

  /** Every completion in the family that is waiting for a parent, oldest first. */
  async listForFamily(code: unknown) {
    const family = await this.families.findByCode(code);
    const nicknames = new Map(
      family.children.map((child) => [child.id, child.nickname]),
    );

    const pending = await this.prisma.completion.findMany({
      where: { status: 'pending', childId: { in: [...nicknames.keys()] } },
      orderBy: { completedAt: 'asc' },
    });

    return Promise.all(
      pending.map(async (row) => {
        const mission = await this.missions.findMission(
          row.childId,
          row.day,
          row.missionId,
        );
        return {
          id: row.id,
          childId: row.childId,
          nickname: nicknames.get(row.childId) ?? null,
          missionId: row.missionId,
          title: mission?.title ?? null,
          points: mission?.points ?? 0,
          verifiedBy: row.verifiedBy,
          status: row.status,
          day: row.day,
          completedAt: row.completedAt,
        };
      }),
    );
  }

  /**
   * A parent approves (points are awarded, within that day's cap) or rejects
   * (the child may redo it) a pending completion. Reviewing twice changes nothing.
   */
  async review(id: string, body: unknown) {
    const input = (body ?? {}) as Record<string, unknown>;

    if (input.decision !== 'approve' && input.decision !== 'reject') {
      throw new BadRequestException("decision must be 'approve' or 'reject'");
    }
    const family = await this.families.verifyParent(input.familyCode, input.pin);

    const completion = await this.prisma.completion.findFirst({
      where: { id, child: { familyId: family.id } },
    });
    if (!completion) throw new NotFoundException('completion not found');
    const { childId, missionId, day } = completion;

    const mission = await this.missions.findMission(childId, day, missionId);

    return this.prisma.$transaction(async (tx) => {
      await this.points.lockChild(tx, childId);

      const current = await tx.completion.findUniqueOrThrow({ where: { id } });
      const awardedBefore = await this.points.awardedToday(tx, childId, day);
      const summary = {
        id,
        childId,
        missionId,
        day,
        dailyCap: this.points.dailyCap(),
      };

      if (current.status !== 'pending') {
        return {
          ...summary,
          status: current.status,
          alreadyReviewed: true,
          pointsAwarded: 0,
          pointsForDay: awardedBefore,
        };
      }

      const status = input.decision === 'approve' ? 'approved' : 'rejected';
      const pointsAwarded =
        status === 'approved'
          ? this.points.withinCap(mission?.points ?? 0, awardedBefore)
          : 0;
      await tx.completion.update({
        where: { id },
        data: { status, points: pointsAwarded, reviewedAt: new Date() },
      });

      return {
        ...summary,
        status,
        alreadyReviewed: false,
        pointsAwarded,
        pointsForDay: awardedBefore + pointsAwarded,
      };
    });
  }
}
