import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

interface FamilyRow {
  id: string;
  name: string;
  code: string;
  pinHash: string | null;
  pinFailures: number;
  pinLockedUntil: Date | null;
  createdAt: Date;
}

interface ChildRow {
  id: string;
  familyId: string;
  age: number;
  language: string;
  nickname: string | null;
  createdAt: Date;
}

interface DailyMissionRow {
  id: string;
  childId: string;
  day: string;
  missions: unknown;
  source: string;
  createdAt: Date;
}

interface CompletionRow {
  id: string;
  childId: string;
  missionId: string;
  day: string;
  status: string;
  points: number;
  verifiedBy: string;
  result: unknown;
  completedAt: Date;
  reviewedAt: Date | null;
}

interface GameResultRow {
  id: string;
  childId: string;
  day: string;
  game: string;
  score: number;
  points: number;
  result: unknown;
  createdAt: Date;
}

interface PlayRequestRow {
  id: string;
  childId: string;
  day: string;
  status: string;
  requestedAt: Date;
  answeredAt: Date | null;
}

interface NotificationRow {
  id: string;
  familyId: string;
  childId: string;
  audience: string;
  kind: string;
  read: boolean;
  createdAt: Date;
}

function uniqueError(message: string) {
  return new Prisma.PrismaClientKnownRequestError(message, {
    code: 'P2002',
    clientVersion: 'in-memory',
  });
}

function sortBy<T>(rows: T[], orderBy?: Record<string, 'asc' | 'desc'>): T[] {
  if (!orderBy) return rows;
  const entries = Object.entries(orderBy);
  if (entries.length === 0) return rows;
  const [field, dir] = entries[0];
  const factor = dir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const av = (a as Record<string, unknown>)[field];
    const bv = (b as Record<string, unknown>)[field];
    const an = av instanceof Date ? av.getTime() : av;
    const bn = bv instanceof Date ? bv.getTime() : bv;
    if (an === bn) return 0;
    return (an as number | string) > (bn as number | string) ? factor : -factor;
  });
}

function matchScalar(value: unknown, filter: unknown): boolean {
  if (filter === undefined) return true;
  if (filter === null || typeof filter !== 'object' || filter instanceof Date) {
    if (value instanceof Date && filter instanceof Date) {
      return value.getTime() === filter.getTime();
    }
    return value === filter;
  }
  const f = filter as Record<string, unknown>;
  if ('in' in f && Array.isArray(f.in)) {
    return f.in.includes(value);
  }
  if ('gte' in f && (value as string | number) < (f.gte as string | number)) {
    return false;
  }
  if ('lte' in f && (value as string | number) > (f.lte as string | number)) {
    return false;
  }
  return true;
}

function matchWhere(
  row: Record<string, unknown>,
  where: Record<string, unknown> | undefined,
  resolvers?: Record<string, (row: Record<string, unknown>, cond: Record<string, unknown>) => boolean>,
): boolean {
  if (!where) return true;
  for (const [key, cond] of Object.entries(where)) {
    if (cond === undefined) continue;
    if (key === 'OR' && Array.isArray(cond)) {
      const any = cond.some((sub) =>
        matchWhere(row, sub as Record<string, unknown>, resolvers),
      );
      if (!any) return false;
      continue;
    }
    if (resolvers && key in resolvers && cond && typeof cond === 'object') {
      if (!resolvers[key](row, cond as Record<string, unknown>)) return false;
      continue;
    }
    if (!matchScalar(row[key], cond)) return false;
  }
  return true;
}

function applySelect<T extends Record<string, unknown>>(
  row: T,
  select?: Record<string, unknown>,
): Record<string, unknown> {
  if (!select) return { ...row };
  const out: Record<string, unknown> = {};
  for (const [key, enabled] of Object.entries(select)) {
    if (enabled) out[key] = row[key];
  }
  return out;
}

function cleanJson(value: unknown): unknown {
  if (value === Prisma.DbNull || value === Prisma.JsonNull || value === undefined) {
    return null;
  }
  return value;
}

/**
 * In-memory implementation of the Prisma delegates used by the LeLije backend.
 * Activated automatically when PostgreSQL is not reachable so every family,
 * child, mission, review, game, play request, and notification flow works live.
 */
export function createInMemoryPrisma() {
  const families: FamilyRow[] = [];
  const children: ChildRow[] = [];
  const dailyMissions: DailyMissionRow[] = [];
  const completions: CompletionRow[] = [];
  const gameResults: GameResultRow[] = [];
  const playRequests: PlayRequestRow[] = [];
  const notifications: NotificationRow[] = [];

  const childResolver = {
    child: (row: Record<string, unknown>, cond: Record<string, unknown>) => {
      const child = children.find((c) => c.id === row.childId);
      if (!child) return false;
      return matchWhere(child as unknown as Record<string, unknown>, cond);
    },
  };

  function hydrateChildInclude<T extends { childId: string }>(
    row: T,
    include?: { child?: boolean | { select?: Record<string, boolean> } },
  ): Record<string, unknown> {
    const base: Record<string, unknown> = { ...row };
    if (include?.child) {
      const child = children.find((c) => c.id === row.childId);
      if (child) {
        base.child =
          typeof include.child === 'object' && include.child.select
            ? applySelect(child as unknown as Record<string, unknown>, include.child.select)
            : { ...child };
      }
    }
    return base;
  }

  const client = {
    family: {
      async create(args: { data: Partial<FamilyRow>; select?: Record<string, unknown> }) {
        if (families.some((f) => f.code === args.data.code)) {
          throw uniqueError('Family code already exists');
        }
        const row: FamilyRow = {
          id: args.data.id ?? randomUUID(),
          name: args.data.name ?? '',
          code: args.data.code ?? '',
          pinHash: args.data.pinHash ?? null,
          pinFailures: args.data.pinFailures ?? 0,
          pinLockedUntil: args.data.pinLockedUntil ?? null,
          createdAt: args.data.createdAt ?? new Date(),
        };
        families.push(row);
        return applySelect(row as unknown as Record<string, unknown>, args.select);
      },

      async findUnique(args: {
        where: { id?: string; code?: string };
        select?: Record<string, unknown>;
      }) {
        const row = families.find(
          (f) =>
            (args.where.id !== undefined && f.id === args.where.id) ||
            (args.where.code !== undefined && f.code === args.where.code),
        );
        if (!row) return null;
        if (!args.select) return { ...row };
        const out = applySelect(row as unknown as Record<string, unknown>, args.select);
        if (args.select.children) {
          const opts = args.select.children as { orderBy?: Record<string, 'asc' | 'desc'> } | true;
          const famChildren = children.filter((c) => c.familyId === row.id);
          out.children = sortBy(
            famChildren.map((c) => ({ ...c })),
            typeof opts === 'object' ? opts.orderBy : undefined,
          );
        }
        return out;
      },

      async update(args: { where: { id?: string; code?: string }; data: Partial<FamilyRow> }) {
        const row = families.find(
          (f) =>
            (args.where.id !== undefined && f.id === args.where.id) ||
            (args.where.code !== undefined && f.code === args.where.code),
        );
        if (!row) throw new Error('Family not found');
        Object.assign(row, args.data);
        return { ...row };
      },

      async updateMany(args: {
        where?: Record<string, unknown>;
        data: Partial<FamilyRow>;
      }) {
        let count = 0;
        for (const row of families) {
          if (matchWhere(row as unknown as Record<string, unknown>, args.where)) {
            Object.assign(row, args.data);
            count += 1;
          }
        }
        return { count };
      },
    },

    child: {
      async create(args: { data: Partial<ChildRow> }) {
        const row: ChildRow = {
          id: args.data.id ?? randomUUID(),
          familyId: args.data.familyId ?? '',
          age: args.data.age ?? 6,
          language: args.data.language ?? 'en',
          nickname: args.data.nickname ?? null,
          createdAt: args.data.createdAt ?? new Date(),
        };
        children.push(row);
        return { ...row };
      },

      async findUnique(args: { where: { id: string } }) {
        const row = children.find((c) => c.id === args.where.id);
        return row ? { ...row } : null;
      },
    },

    dailyMission: {
      async create(args: { data: Partial<DailyMissionRow> }) {
        if (
          dailyMissions.some(
            (m) => m.childId === args.data.childId && m.day === args.data.day,
          )
        ) {
          throw uniqueError('DailyMission already exists');
        }
        const row: DailyMissionRow = {
          id: args.data.id ?? randomUUID(),
          childId: args.data.childId ?? '',
          day: args.data.day ?? '',
          missions: args.data.missions ?? [],
          source: args.data.source ?? 'fallback',
          createdAt: args.data.createdAt ?? new Date(),
        };
        dailyMissions.push(row);
        return { ...row };
      },

      async findUnique(args: {
        where: { id?: string; childId_day?: { childId: string; day: string } };
      }) {
        const row = dailyMissions.find((m) =>
          args.where.childId_day
            ? m.childId === args.where.childId_day.childId &&
              m.day === args.where.childId_day.day
            : m.id === args.where.id,
        );
        return row ? { ...row } : null;
      },

      async findMany(args?: { where?: Record<string, unknown> }) {
        return dailyMissions
          .filter((m) => matchWhere(m as unknown as Record<string, unknown>, args?.where))
          .map((m) => ({ ...m }));
      },
    },

    completion: {
      async create(args: { data: Partial<CompletionRow> }) {
        if (
          completions.some(
            (c) =>
              c.childId === args.data.childId &&
              c.missionId === args.data.missionId &&
              c.day === args.data.day,
          )
        ) {
          throw uniqueError('Completion already exists');
        }
        const row: CompletionRow = {
          id: args.data.id ?? randomUUID(),
          childId: args.data.childId ?? '',
          missionId: args.data.missionId ?? '',
          day: args.data.day ?? '',
          status: args.data.status ?? 'pending',
          points: args.data.points ?? 0,
          verifiedBy: args.data.verifiedBy ?? 'self',
          result: cleanJson(args.data.result),
          completedAt: args.data.completedAt ?? new Date(),
          reviewedAt: args.data.reviewedAt ?? null,
        };
        completions.push(row);
        return { ...row };
      },

      async update(args: { where: { id: string }; data: Partial<CompletionRow> }) {
        const row = completions.find((c) => c.id === args.where.id);
        if (!row) throw new Error('Completion not found');
        const next = { ...args.data };
        if ('result' in next) next.result = cleanJson(next.result);
        Object.assign(row, next);
        return { ...row };
      },

      async findUnique(args: {
        where: {
          id?: string;
          childId_missionId_day?: { childId: string; missionId: string; day: string };
        };
      }) {
        const row = completions.find((c) =>
          args.where.childId_missionId_day
            ? c.childId === args.where.childId_missionId_day.childId &&
              c.missionId === args.where.childId_missionId_day.missionId &&
              c.day === args.where.childId_missionId_day.day
            : c.id === args.where.id,
        );
        return row ? { ...row } : null;
      },

      async findUniqueOrThrow(args: { where: { id: string } }) {
        const row = completions.find((c) => c.id === args.where.id);
        if (!row) throw new Error('Completion not found');
        return { ...row };
      },

      async findFirst(args?: { where?: Record<string, unknown> }) {
        const row = completions.find((c) =>
          matchWhere(c as unknown as Record<string, unknown>, args?.where, childResolver),
        );
        return row ? { ...row } : null;
      },

      async findMany(args?: {
        where?: Record<string, unknown>;
        orderBy?: Record<string, 'asc' | 'desc'>;
      }) {
        const matched = completions
          .filter((c) =>
            matchWhere(c as unknown as Record<string, unknown>, args?.where, childResolver),
          )
          .map((c) => ({ ...c }));
        return sortBy(matched, args?.orderBy);
      },

      async aggregate(args?: { where?: Record<string, unknown> }) {
        const matched = completions.filter((c) =>
          matchWhere(c as unknown as Record<string, unknown>, args?.where, childResolver),
        );
        const total = matched.reduce((sum, c) => sum + c.points, 0);
        return { _sum: { points: matched.length > 0 ? total : null } };
      },
    },

    gameResult: {
      async create(args: { data: Partial<GameResultRow> }) {
        if (
          gameResults.some(
            (g) =>
              g.childId === args.data.childId &&
              g.day === args.data.day &&
              g.game === args.data.game,
          )
        ) {
          throw uniqueError('GameResult already exists');
        }
        const row: GameResultRow = {
          id: args.data.id ?? randomUUID(),
          childId: args.data.childId ?? '',
          day: args.data.day ?? '',
          game: args.data.game ?? '',
          score: args.data.score ?? 0,
          points: args.data.points ?? 0,
          result: args.data.result ?? {},
          createdAt: args.data.createdAt ?? new Date(),
        };
        gameResults.push(row);
        return { ...row };
      },

      async findUnique(args: {
        where: {
          id?: string;
          childId_day_game?: { childId: string; day: string; game: string };
        };
      }) {
        const row = gameResults.find((g) =>
          args.where.childId_day_game
            ? g.childId === args.where.childId_day_game.childId &&
              g.day === args.where.childId_day_game.day &&
              g.game === args.where.childId_day_game.game
            : g.id === args.where.id,
        );
        return row ? { ...row } : null;
      },

      async findMany(args?: { where?: Record<string, unknown> }) {
        return gameResults
          .filter((g) => matchWhere(g as unknown as Record<string, unknown>, args?.where))
          .map((g) => ({ ...g }));
      },

      async aggregate(args?: { where?: Record<string, unknown> }) {
        const matched = gameResults.filter((g) =>
          matchWhere(g as unknown as Record<string, unknown>, args?.where),
        );
        const total = matched.reduce((sum, g) => sum + g.points, 0);
        return { _sum: { points: matched.length > 0 ? total : null } };
      },
    },

    playRequest: {
      async create(args: { data: Partial<PlayRequestRow> }) {
        const row: PlayRequestRow = {
          id: args.data.id ?? randomUUID(),
          childId: args.data.childId ?? '',
          day: args.data.day ?? '',
          status: args.data.status ?? 'sent',
          requestedAt: args.data.requestedAt ?? new Date(),
          answeredAt: args.data.answeredAt ?? null,
        };
        playRequests.push(row);
        return { ...row };
      },

      async update(args: { where: { id: string }; data: Partial<PlayRequestRow> }) {
        const row = playRequests.find((r) => r.id === args.where.id);
        if (!row) throw new Error('PlayRequest not found');
        Object.assign(row, args.data);
        return { ...row };
      },

      async updateMany(args: {
        where?: Record<string, unknown>;
        data: Partial<PlayRequestRow>;
      }) {
        let count = 0;
        for (const row of playRequests) {
          if (matchWhere(row as unknown as Record<string, unknown>, args.where, childResolver)) {
            Object.assign(row, args.data);
            count += 1;
          }
        }
        return { count };
      },

      async findUniqueOrThrow(args: { where: { id: string } }) {
        const row = playRequests.find((r) => r.id === args.where.id);
        if (!row) throw new Error('PlayRequest not found');
        return { ...row };
      },

      async findFirst(args?: {
        where?: Record<string, unknown>;
        orderBy?: Record<string, 'asc' | 'desc'>;
        include?: { child?: boolean | { select?: Record<string, boolean> } };
      }) {
        const matched = sortBy(
          playRequests.filter((r) =>
            matchWhere(r as unknown as Record<string, unknown>, args?.where, childResolver),
          ),
          args?.orderBy,
        );
        const row = matched[0];
        if (!row) return null;
        return hydrateChildInclude(row, args?.include);
      },

      async findMany(args?: {
        where?: Record<string, unknown>;
        orderBy?: Record<string, 'asc' | 'desc'>;
        take?: number;
      }) {
        const matched = sortBy(
          playRequests
            .filter((r) =>
              matchWhere(r as unknown as Record<string, unknown>, args?.where, childResolver),
            )
            .map((r) => ({ ...r })),
          args?.orderBy,
        );
        return args?.take !== undefined ? matched.slice(0, args.take) : matched;
      },
    },

    notification: {
      async create(args: { data: Partial<NotificationRow> }) {
        const row: NotificationRow = {
          id: args.data.id ?? randomUUID(),
          familyId: args.data.familyId ?? '',
          childId: args.data.childId ?? '',
          audience: args.data.audience ?? 'parent',
          kind: args.data.kind ?? 'mission_pending',
          read: args.data.read ?? false,
          createdAt: args.data.createdAt ?? new Date(),
        };
        notifications.push(row);
        return { ...row };
      },

      async findMany(args?: {
        where?: Record<string, unknown>;
        orderBy?: Record<string, 'asc' | 'desc'>;
        take?: number;
        include?: { child?: boolean | { select?: Record<string, boolean> } };
      }) {
        let matched = sortBy(
          notifications.filter((n) =>
            matchWhere(n as unknown as Record<string, unknown>, args?.where, childResolver),
          ),
          args?.orderBy,
        );
        if (args?.take !== undefined) matched = matched.slice(0, args.take);
        return matched.map((n) => hydrateChildInclude(n, args?.include));
      },

      async count(args?: { where?: Record<string, unknown> }) {
        return notifications.filter((n) =>
          matchWhere(n as unknown as Record<string, unknown>, args?.where, childResolver),
        ).length;
      },

      async updateMany(args: {
        where?: Record<string, unknown>;
        data: Partial<NotificationRow>;
      }) {
        let count = 0;
        for (const row of notifications) {
          if (matchWhere(row as unknown as Record<string, unknown>, args.where, childResolver)) {
            Object.assign(row, args.data);
            count += 1;
          }
        }
        return { count };
      },
    },

    async $transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
      return fn(client);
    },

    async $executeRaw(): Promise<number> {
      return 0;
    },

    async $queryRaw(strings: TemplateStringsArray | string, ...values: unknown[]) {
      const sql = Array.isArray(strings) ? strings.join(' ') : String(strings);
      if (sql.includes('UPDATE "Family"') && sql.includes('pinFailures')) {
        const familyId = values[0] as string;
        const maxFailures = Number(values[1] ?? 5);
        const fam = families.find((f) => f.id === familyId);
        if (!fam || fam.pinFailures >= maxFailures) return [];
        fam.pinFailures += 1;
        return [{ pinFailures: fam.pinFailures }];
      }
      return [];
    },
  };

  return client;
}
