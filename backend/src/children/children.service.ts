import { BadRequestException, Injectable } from '@nestjs/common';
import { FamiliesService } from '../families/families.service';
import { PrismaService } from '../prisma/prisma.service';

const LANGUAGES = ['en', 'am', 'om'];
const MIN_AGE = 4;
const MAX_AGE = 14;
const MAX_NICKNAME_LENGTH = 20;

@Injectable()
export class ChildrenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly families: FamiliesService,
  ) {}

  async create(body: unknown) {
    const input = (body ?? {}) as Record<string, unknown>;

    if (typeof input.familyCode !== 'string') {
      throw new BadRequestException('familyCode must be a string');
    }
    if (typeof input.age !== 'number' || !Number.isFinite(input.age)) {
      throw new BadRequestException('age must be a number');
    }
    const age = Math.min(MAX_AGE, Math.max(MIN_AGE, Math.round(input.age)));

    const language =
      typeof input.language === 'string' && LANGUAGES.includes(input.language)
        ? input.language
        : 'en';

    if (input.nickname != null && typeof input.nickname !== 'string') {
      throw new BadRequestException('nickname must be a string');
    }
    const nickname =
      input.nickname?.trim().slice(0, MAX_NICKNAME_LENGTH) || null;

    const family = await this.families.findByCode(input.familyCode);

    return this.prisma.child.create({
      data: { familyId: family.id, age, language, nickname },
    });
  }
}
