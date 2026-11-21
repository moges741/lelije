import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

const DEFAULT_DAILY_CAP = 100;

/** Shared rules for awarding points: one daily cap across missions and games. */
@Injectable()
export class PointsService {
  dailyCap(): number {
    const cap = Number(process.env.DAILY_POINTS_CAP);
    return Number.isInteger(cap) && cap > 0 ? cap : DEFAULT_DAILY_CAP;
  }

  /**
   * Makes concurrent awards for one child wait for each other until the
   * transaction ends, so two requests cannot both pass the cap or duplicate check.
   */
  async lockChild(tx: Prisma.TransactionClient, childId: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${childId}))`;
  }

  async awardedToday(
    tx: Prisma.TransactionClient,
    childId: string,
    day: string,
  ): Promise<number> {
    const [missions, games] = await Promise.all([
      tx.completion.aggregate({
        where: { childId, day },
        _sum: { points: true },
      }),
      tx.gameResult.aggregate({
        where: { childId, day },
        _sum: { points: true },
      }),
    ]);
    return (missions._sum.points ?? 0) + (games._sum.points ?? 0);
  }

  /** How many of `wanted` points still fit under today's cap. */
  withinCap(wanted: number, awardedToday: number): number {
    return Math.max(0, Math.min(wanted, this.dailyCap() - awardedToday));
  }
}
