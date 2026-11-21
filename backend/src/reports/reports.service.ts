import { Injectable } from '@nestjs/common';
import { Completion } from '@prisma/client';
import { addisDay, countStreak, daysAgo } from '../common/day';
import { FamiliesService } from '../families/families.service';
import { Mission } from '../missions/missions.types';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_DAYS = 7;
const MAX_DAYS = 30;
const ACTIVITY_LIMIT = 100;

function periodOf(raw: unknown) {
  const parsed = Number(raw);
  const days = Number.isFinite(parsed)
    ? Math.min(MAX_DAYS, Math.max(1, Math.round(parsed)))
    : DEFAULT_DAYS;
  const to = addisDay();
  return { days, to, from: daysAgo(to, days - 1) };
}

function inPeriod<T extends { day: string }>(rows: T[], from: string, to: string) {
  return rows.filter((row) => row.day >= from && row.day <= to);
}

function sum(rows: { points: number }[]) {
  return rows.reduce((total, row) => total + row.points, 0);
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly families: FamiliesService,
  ) {}

  /** Missions and games in the period, newest first. */
  async activity(code: string, days: unknown) {
    const period = periodOf(days);
    const family = await this.families.findByCode(code);
    const loaded = await this.load(family.children.map((child) => child.id), period);
    const nicknames = new Map(
      family.children.map((child) => [child.id, child.nickname]),
    );

    const items = [
      ...inPeriod(loaded.completions, period.from, period.to).map((row) => ({
        kind: 'mission' as const,
        id: row.id,
        childId: row.childId,
        nickname: nicknames.get(row.childId) ?? null,
        day: row.day,
        missionId: row.missionId,
        title: loaded.title(row),
        status: row.status,
        points: row.points,
        verifiedBy: row.verifiedBy,
        at: row.completedAt,
      })),
      ...inPeriod(loaded.games, period.from, period.to).map((row) => ({
        kind: 'game' as const,
        id: row.id,
        childId: row.childId,
        nickname: nicknames.get(row.childId) ?? null,
        day: row.day,
        game: row.game,
        score: row.score,
        points: row.points,
        at: row.createdAt,
      })),
    ]
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, ACTIVITY_LIMIT);

    return { ...period, items };
  }

  /** One line per child: lifetime points, the streak, and totals for the period. */
  async report(code: string, days: unknown) {
    const period = periodOf(days);
    const family = await this.families.findByCode(code);
    const ids = family.children.map((child) => child.id);
    const loaded = await this.load(ids, period);
    const today = period.to;

    const children = family.children.map((child) => {
      const mine = <T extends { childId: string }>(rows: T[]) =>
        rows.filter((row) => row.childId === child.id);
      const completions = mine(loaded.completions);
      const games = mine(loaded.games);
      const approved = completions.filter((row) => row.status === 'approved');
      const inWindow = inPeriod(completions, period.from, period.to);
      const gamesInWindow = inPeriod(games, period.from, period.to);
      const requests = inPeriod(mine(loaded.play), period.from, period.to);
      const activeDays = new Set(
        [...approved, ...games].map((row) => row.day),
      );

      return {
        childId: child.id,
        nickname: child.nickname,
        totalPoints: sum(approved) + sum(games),
        pointsInPeriod:
          sum(inWindow.filter((row) => row.status === 'approved')) +
          sum(gamesInWindow),
        streak: countStreak(activeDays, today),
        period: {
          missionsApproved: inWindow.filter((row) => row.status === 'approved').length,
          missionsPending: inWindow.filter((row) => row.status === 'pending').length,
          missionsRejected: inWindow.filter((row) => row.status === 'rejected').length,
          gamesPlayed: gamesInWindow.length,
          gamePoints: sum(gamesInWindow),
          playRequests: {
            sent: requests.filter((row) => row.status === 'sent').length,
            allowed: requests.filter((row) => row.status === 'allowed').length,
            later: requests.filter((row) => row.status === 'later').length,
            declined: requests.filter((row) => row.status === 'declined').length,
          },
        },
      };
    });

    return {
      family: { name: family.name, code: family.code },
      ...period,
      children,
    };
  }

  private async load(
    childIds: string[],
    period: { from: string; to: string },
  ) {
    const where = { childId: { in: childIds } };
    const [completions, games, missions, play] = await Promise.all([
      this.prisma.completion.findMany({ where }),
      this.prisma.gameResult.findMany({ where }),
      this.prisma.dailyMission.findMany({
        where: { ...where, day: { gte: period.from, lte: period.to } },
      }),
      this.prisma.playRequest.findMany({ where }),
    ]);

    const titles = new Map<string, string>();
    for (const row of missions) {
      for (const mission of row.missions as unknown as Mission[]) {
        titles.set(`${row.childId}:${row.day}:${mission.id}`, mission.title);
      }
    }

    return {
      completions,
      games,
      play,
      title: (row: Completion) =>
        titles.get(`${row.childId}:${row.day}:${row.missionId}`) ?? null,
    };
  }
}
