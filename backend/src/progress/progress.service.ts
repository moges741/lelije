import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Child } from '@prisma/client';
import { addisDay, previousDay } from '../common/day';
import { FamiliesService } from '../families/families.service';
import { Mission } from '../missions/missions.types';
import { PointsService } from '../points/points.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Consecutive active days ending today. A day with nothing yet today does not
 * break the streak, so it still shows in the morning: counting then starts yesterday.
 */
function countStreak(activeDays: Set<string>, today: string): number {
  let day = activeDays.has(today) ? today : previousDay(today);
  let streak = 0;
  while (activeDays.has(day)) {
    streak++;
    day = previousDay(day);
  }
  return streak;
}

function sumPoints(rows: { points: number }[]): number {
  return rows.reduce((total, row) => total + row.points, 0);
}

@Injectable()
export class ProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly points: PointsService,
    private readonly families: FamiliesService,
  ) {}

  async forChildId(childId: unknown) {
    if (typeof childId !== 'string' || childId === '') {
      throw new BadRequestException('childId must be a string');
    }
    const child = await this.prisma.child.findUnique({
      where: { id: childId },
    });
    if (!child) throw new NotFoundException('child not found');
    return this.forChild(child);
  }

  /** The family report: every child's progress, oldest child first. */
  async forFamily(code: unknown) {
    const family = await this.families.findByCode(code);
    return {
      family: { name: family.name, code: family.code },
      children: await Promise.all(
        family.children.map((child) => this.forChild(child)),
      ),
    };
  }

  private async forChild(child: Child) {
    const today = addisDay();
    const [completions, games, daily] = await Promise.all([
      this.prisma.completion.findMany({
        where: { childId: child.id },
        orderBy: { completedAt: 'asc' },
      }),
      this.prisma.gameResult.findMany({ where: { childId: child.id } }),
      this.prisma.dailyMission.findUnique({
        where: { childId_day: { childId: child.id, day: today } },
      }),
    ]);

    const todaysMissions = (daily?.missions ?? []) as unknown as Mission[];
    const missionsById = new Map(
      todaysMissions.map((mission) => [mission.id, mission]),
    );
    // Only approved completions carry points and count toward the streak.
    const approved = completions.filter((row) => row.status === 'approved');
    const todayWith = (status: string) =>
      completions.filter((row) => row.day === today && row.status === status);
    const gameToday = games.find((row) => row.day === today);
    const activeDays = new Set([...approved, ...games].map((row) => row.day));

    return {
      childId: child.id,
      nickname: child.nickname,
      totalPoints: sumPoints(approved) + sumPoints(games),
      pointsToday:
        sumPoints(todayWith('approved')) + (gameToday?.points ?? 0),
      dailyCap: this.points.dailyCap(),
      streak: countStreak(activeDays, today),
      today: {
        day: today,
        missionsTotal: todaysMissions.length,
        missionsCompleted: todayWith('approved').map((row) => ({
          missionId: row.missionId,
          title: missionsById.get(row.missionId)?.title ?? null,
          points: row.points,
          verifiedBy: row.verifiedBy,
          completedAt: row.completedAt,
        })),
        missionsPending: todayWith('pending').map((row) => ({
          missionId: row.missionId,
          title: missionsById.get(row.missionId)?.title ?? null,
          points: missionsById.get(row.missionId)?.points ?? 0,
          completedAt: row.completedAt,
        })),
        missionsToRedo: todayWith('rejected').map((row) => ({
          missionId: row.missionId,
          title: missionsById.get(row.missionId)?.title ?? null,
        })),
        game: gameToday
          ? { game: gameToday.game, score: gameToday.score, points: gameToday.points }
          : null,
      },
    };
  }
}
