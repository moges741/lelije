import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FamiliesService } from '../families/families.service';
import { PrismaService } from '../prisma/prisma.service';

const AUDIENCES = ['parent', 'child'];
const LIST_LIMIT = 50;

export interface NotificationInput {
  familyId: string;
  childId: string;
  audience: 'parent' | 'child';
  kind:
    | 'mission_pending'
    | 'mission_approved'
    | 'mission_rejected'
    | 'play_sent'
    | 'play_answered';
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly families: FamiliesService,
  ) {}

  /** Stores one notification inside the caller's transaction. */
  record(tx: Prisma.TransactionClient, input: NotificationInput) {
    return tx.notification.create({ data: input });
  }

  async list(code: string, audience: unknown, childId: unknown) {
    const where = await this.where(code, audience, childId);
    const [notifications, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: LIST_LIMIT,
        include: { child: { select: { nickname: true } } },
      }),
      this.prisma.notification.count({ where: { ...where, read: false } }),
    ]);
    return {
      unread,
      notifications: notifications.map((row) => ({
        id: row.id,
        audience: row.audience,
        kind: row.kind,
        childId: row.childId,
        nickname: row.child.nickname,
        read: row.read,
        at: row.createdAt,
      })),
    };
  }

  /** Marks every unread notification for that audience as read. */
  async markRead(code: string, body: unknown) {
    const input = (body ?? {}) as Record<string, unknown>;
    const where = await this.where(code, input.audience, input.childId);
    const { count } = await this.prisma.notification.updateMany({
      where: { ...where, read: false },
      data: { read: true },
    });
    return { marked: count };
  }

  private async where(code: string, audience: unknown, childId: unknown) {
    if (typeof audience !== 'string' || !AUDIENCES.includes(audience)) {
      throw new BadRequestException("audience must be 'parent' or 'child'");
    }
    const family = await this.families.findByCode(code);

    if (audience === 'parent') {
      return { familyId: family.id, audience };
    }
    if (typeof childId !== 'string') {
      throw new BadRequestException('childId must be a string');
    }
    const child = family.children.find((candidate) => candidate.id === childId);
    if (!child) throw new NotFoundException('child not found');
    return { familyId: family.id, audience, childId };
  }
}
