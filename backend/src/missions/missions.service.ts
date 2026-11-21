import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { addisDay } from '../common/day';
import { PrismaService } from '../prisma/prisma.service';
import { generateContractBMissions } from './ai-missions.adapter';
import { GenerationLimiter } from './generation-limiter';
import { Mission, MissionsResult } from './missions.types';

const SPACES = ['small-indoor', 'large-indoor', 'outdoor-yard'];
const DEFAULT_COUNT = 3;
const MIN_COUNT = 1;
const MAX_COUNT = 5;

@Injectable()
export class MissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limiter: GenerationLimiter,
  ) {}

  /** Returns today's missions for a child, generating them on the first call of the day. */
  async getToday(body: unknown): Promise<MissionsResult> {
    const input = (body ?? {}) as Record<string, unknown>;

    if (typeof input.childId !== 'string') {
      throw new BadRequestException('childId must be a string');
    }
    const child = await this.prisma.child.findUnique({
      where: { id: input.childId },
    });
    if (!child) throw new NotFoundException('child not found');

    const day = addisDay();
    const saved = await this.findSaved(child.id, day);
    if (saved) return saved;

    if (!this.limiter.tryConsume(child.familyId)) {
      throw new HttpException(
        'too many mission requests, try again later',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const count =
      typeof input.count === 'number' && Number.isFinite(input.count)
        ? Math.min(MAX_COUNT, Math.max(MIN_COUNT, Math.round(input.count)))
        : DEFAULT_COUNT;

    const result = await generateContractBMissions({
      age: child.age,
      language: child.language,
      count,
      cameraAvailable: input.cameraAvailable === true,
      space:
        typeof input.space === 'string' && SPACES.includes(input.space)
          ? input.space
          : 'small-indoor',
      weather: input.weather,
      interests: input.interests,
      excludeIds: [],
    });

    // An empty day must not be saved, or the child would see no missions until tomorrow.
    if (!Array.isArray(result?.missions) || result.missions.length === 0) {
      throw new ServiceUnavailableException('no missions available');
    }

    try {
      await this.prisma.dailyMission.create({
        data: {
          childId: child.id,
          day,
          missions: result.missions as unknown as Prisma.InputJsonValue,
          source: result.source,
        },
      });
    } catch (error) {
      // Two first requests arrived together: the other one saved its list first, so return that.
      const alreadySaved =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002';
      const winner = alreadySaved && (await this.findSaved(child.id, day));
      if (!winner) throw error;
      return winner;
    }

    return result;
  }

  /** One mission from a child's saved list for a day. */
  async findMission(
    childId: string,
    day: string,
    missionId: string,
  ): Promise<Mission | undefined> {
    const saved = await this.findSaved(childId, day);
    return saved?.missions.find((mission) => mission.id === missionId);
  }

  private async findSaved(
    childId: string,
    day: string,
  ): Promise<MissionsResult | null> {
    const row = await this.prisma.dailyMission.findUnique({
      where: { childId_day: { childId, day } },
    });
    if (!row) return null;
    return {
      missions: row.missions as unknown as Mission[],
      source: row.source as MissionsResult['source'],
      warnings: [],
    };
  }
}
