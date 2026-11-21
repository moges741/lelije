import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomInt } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

const MAX_NAME_LENGTH = 40;
// No 0/O, 1/I/L: a parent has to read this code and type it on another phone.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const CODE_ATTEMPTS = 5;

function generateCode(): string {
  let code = 'LJ-';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

@Injectable()
export class FamiliesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(body: unknown) {
    const input = (body ?? {}) as Record<string, unknown>;

    if (typeof input.name !== 'string' || input.name.trim() === '') {
      throw new BadRequestException('name must be a non-empty string');
    }
    const name = input.name.trim().slice(0, MAX_NAME_LENGTH);

    for (let attempt = 1; ; attempt++) {
      try {
        return await this.prisma.family.create({
          data: { name, code: generateCode() },
        });
      } catch (error) {
        const codeTaken =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002';
        if (!codeTaken || attempt === CODE_ATTEMPTS) throw error;
      }
    }
  }

  /** Looks a family up by the code a parent typed; 404 when it does not exist. */
  async findByCode(code: unknown) {
    const family =
      typeof code === 'string'
        ? await this.prisma.family.findUnique({
            where: { code: code.trim().toUpperCase() },
            include: { children: { orderBy: { createdAt: 'asc' } } },
          })
        : null;

    if (!family) throw new NotFoundException('family not found');
    return family;
  }
}
