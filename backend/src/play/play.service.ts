import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PlayRequest } from '@prisma/client';
import { addisDay } from '../common/day';
import { FamiliesService } from '../families/families.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

const ANSWERS = ['allowed', 'later', 'declined'];
const LIST_LIMIT = 50;

function view(request: PlayRequest, nickname: string | null) {
  return {
    id: request.id,
    childId: request.childId,
    nickname,
    status: request.status,
    requestedAt: request.requestedAt,
    answeredAt: request.answeredAt,
  };
}

@Injectable()
export class PlayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly families: FamiliesService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * A child asks for play time. Asking again while a request is unanswered
   * refreshes that request instead of adding another.
   */
  async ask(body: unknown) {
    const input = (body ?? {}) as Record<string, unknown>;
    if (typeof input.childId !== 'string') {
      throw new BadRequestException('childId must be a string');
    }
    const { childId } = input;

    const child = await this.prisma.child.findUnique({
      where: { id: childId },
    });
    if (!child) throw new NotFoundException('child not found');

    const day = addisDay();
    return this.prisma.$transaction(async (tx) => {
      // Two taps at once must not leave two open requests.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`play:${childId}`}))`;

      const open = await tx.playRequest.findFirst({
        where: { childId, status: 'sent' },
      });
      const request = open
        ? await tx.playRequest.update({
            where: { id: open.id },
            data: { day, requestedAt: new Date() },
          })
        : await tx.playRequest.create({
            data: { childId, day, status: 'sent' },
          });
      if (!open) {
        await this.notifications.record(tx, {
          familyId: child.familyId,
          childId,
          audience: 'parent',
          kind: 'play_sent',
        });
      }
      return { ...view(request, child.nickname), alreadyAsked: open !== null };
    });
  }

  /** The family's play-time requests, newest first. */
  async listForFamily(code: unknown) {
    const family = await this.families.findByCode(code);
    const nicknames = new Map(
      family.children.map((child) => [child.id, child.nickname]),
    );

    const requests = await this.prisma.playRequest.findMany({
      where: { childId: { in: [...nicknames.keys()] } },
      orderBy: { requestedAt: 'desc' },
      take: LIST_LIMIT,
    });
    return requests.map((request) =>
      view(request, nicknames.get(request.childId) ?? null),
    );
  }

  /** A parent answers an open request; answering twice changes nothing. */
  async answer(id: string, body: unknown) {
    const input = (body ?? {}) as Record<string, unknown>;
    if (typeof input.answer !== 'string' || !ANSWERS.includes(input.answer)) {
      throw new BadRequestException(
        "answer must be 'allowed', 'later' or 'declined'",
      );
    }
    const answer = input.answer;
    const family = await this.families.verifyParent(input.familyCode, input.pin);

    const request = await this.prisma.playRequest.findFirst({
      where: { id, child: { familyId: family.id } },
      include: { child: { select: { nickname: true } } },
    });
    if (!request) throw new NotFoundException('play request not found');

    const { current, changed } = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.playRequest.updateMany({
        where: { id, status: 'sent' },
        data: { status: answer, answeredAt: new Date() },
      });
      if (count > 0) {
        await this.notifications.record(tx, {
          familyId: family.id,
          childId: request.childId,
          audience: 'child',
          kind: 'play_answered',
        });
      }
      return {
        current: await tx.playRequest.findUniqueOrThrow({ where: { id } }),
        changed: count > 0,
      };
    });
    return {
      ...view(current, request.child.nickname),
      alreadyAnswered: !changed,
    };
  }
}
