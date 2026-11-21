import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomInt } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { hashPin, parsePin, pinMatches } from './pin';

const MAX_NAME_LENGTH = 40;
// No 0/O, 1/I/L: a parent has to read this code and type it on another phone.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const CODE_ATTEMPTS = 5;

const MAX_PIN_FAILURES = 5;
const PIN_LOCK_MINUTES = 15;

// Never select pinHash or the lockout counters into a response.
const PUBLIC_FAMILY = {
  id: true,
  name: true,
  code: true,
  createdAt: true,
} satisfies Prisma.FamilySelect;

function generateCode(): string {
  let code = 'LJ-';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

function lockedException(minutes: number) {
  return new HttpException(
    `too many wrong PINs, parent actions are locked for ${minutes} minutes`,
    HttpStatus.TOO_MANY_REQUESTS,
  );
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
    const pinHash = await hashPin(parsePin(input.pin));

    for (let attempt = 1; ; attempt++) {
      try {
        const family = await this.prisma.family.create({
          data: { name, code: generateCode(), pinHash },
          select: PUBLIC_FAMILY,
        });
        return { ...family, hasPin: true };
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
            where: { code: normalizeCode(code) },
            select: {
              ...PUBLIC_FAMILY,
              pinHash: true,
              children: { orderBy: { createdAt: 'asc' } },
            },
          })
        : null;

    if (!family) throw new NotFoundException('family not found');
    const { pinHash, ...rest } = family;
    return { ...rest, hasPin: pinHash !== null };
  }

  /**
   * Sets the parent PIN. A family that already has one must send it as
   * `currentPin`; a family created before PINs existed can set one once without it.
   */
  async setPin(code: string, body: unknown) {
    const input = (body ?? {}) as Record<string, unknown>;
    const pinHash = await hashPin(parsePin(input.pin));

    const family = await this.prisma.family.findUnique({
      where: { code: normalizeCode(code) },
      select: { id: true, pinHash: true },
    });
    if (!family) throw new NotFoundException('family not found');

    if (family.pinHash) {
      await this.verifyParent(code, parsePin(input.currentPin, 'currentPin'));
      await this.prisma.family.update({
        where: { id: family.id },
        data: { pinHash, pinFailures: 0, pinLockedUntil: null },
      });
    } else {
      const { count } = await this.prisma.family.updateMany({
        where: { id: family.id, pinHash: null },
        data: { pinHash },
      });
      if (count === 0) throw new ConflictException('a PIN was just set');
    }
    return { hasPin: true };
  }

  /**
   * Checks the parent PIN for a family and returns the family's id.
   * Five wrong PINs lock parent actions for 15 minutes.
   */
  async verifyParent(code: unknown, pin: unknown): Promise<{ id: string }> {
    if (typeof code !== 'string') {
      throw new BadRequestException('familyCode must be a string');
    }
    const pinText = parsePin(pin);

    const family = await this.prisma.family.findUnique({
      where: { code: normalizeCode(code) },
      select: { id: true, pinHash: true, pinLockedUntil: true },
    });
    if (!family) throw new NotFoundException('family not found');
    if (!family.pinHash) {
      throw new ForbiddenException(
        'this family has no parent PIN yet; set one first',
      );
    }

    const now = Date.now();
    if (family.pinLockedUntil) {
      const msLeft = family.pinLockedUntil.getTime() - now;
      if (msLeft > 0) throw lockedException(Math.ceil(msLeft / 60_000));
      await this.prisma.family.updateMany({
        where: { id: family.id, pinLockedUntil: family.pinLockedUntil },
        data: { pinFailures: 0, pinLockedUntil: null },
      });
    }

    // Counting the attempt before checking it caps guesses at MAX_PIN_FAILURES,
    // even when many requests arrive at once.
    const [attempt] = await this.prisma.$queryRaw<{ pinFailures: number }[]>`
      UPDATE "Family" SET "pinFailures" = "pinFailures" + 1
      WHERE "id" = ${family.id} AND "pinFailures" < ${MAX_PIN_FAILURES}
      RETURNING "pinFailures"`;
    if (!attempt) throw lockedException(PIN_LOCK_MINUTES);

    if (await pinMatches(pinText, family.pinHash)) {
      await this.prisma.family.update({
        where: { id: family.id },
        data: { pinFailures: 0, pinLockedUntil: null },
      });
      return { id: family.id };
    }

    if (attempt.pinFailures >= MAX_PIN_FAILURES) {
      await this.prisma.family.update({
        where: { id: family.id },
        data: { pinLockedUntil: new Date(now + PIN_LOCK_MINUTES * 60_000) },
      });
      throw lockedException(PIN_LOCK_MINUTES);
    }
    throw new ForbiddenException('wrong PIN');
  }
}
