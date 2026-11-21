import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { FamiliesService } from '../families/families.service';
import { PrismaService } from '../prisma/prisma.service';

const TOKEN_TTL_SECONDS = 60 * 60 * 24; // 24 hours

export interface AuthTokenPayload {
  jti: string;
  role: 'parent' | 'child';
  familyId: string;
  familyCode: string;
  childId?: string;
  iat: number;
  exp: number;
}

function toBase64Url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function fromBase64Url(input: string): Buffer {
  return Buffer.from(input, 'base64url');
}

function normalizeCode(code: unknown): string {
  if (typeof code !== 'string' || code.trim() === '') {
    throw new BadRequestException('familyCode must be a non-empty string');
  }
  return code.trim().toUpperCase();
}

@Injectable()
export class AuthService {
  private readonly secret: string;
  /** Tracks revoked token IDs (`jti -> exp` in unix seconds) until expiry. */
  private readonly revoked = new Map<string, number>();

  constructor(
    private readonly families: FamiliesService,
    private readonly prisma: PrismaService,
  ) {
    this.secret =
      process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim().length >= 16
        ? process.env.SESSION_SECRET.trim()
        : randomBytes(32).toString('hex');
  }

  private sign(payload: AuthTokenPayload): string {
    const encoded = toBase64Url(JSON.stringify(payload));
    const sig = createHmac('sha256', this.secret).update(encoded).digest('base64url');
    return `${encoded}.${sig}`;
  }

  private pruneRevoked(nowSec: number): void {
    for (const [jti, exp] of this.revoked.entries()) {
      if (exp <= nowSec) this.revoked.delete(jti);
    }
  }

  private extractBearer(authHeader?: string): string {
    if (!authHeader || typeof authHeader !== 'string') {
      throw new UnauthorizedException('missing authorization token');
    }
    const match = /^Bearer\s+([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(authHeader.trim());
    if (!match) {
      throw new UnauthorizedException('invalid authorization header');
    }
    return match[1];
  }

  issueParentToken(family: { id: string; code: string }): string {
    const now = Math.floor(Date.now() / 1000);
    return this.sign({
      jti: randomBytes(16).toString('hex'),
      role: 'parent',
      familyId: family.id,
      familyCode: family.code,
      iat: now,
      exp: now + TOKEN_TTL_SECONDS,
    });
  }

  issueChildToken(family: { id: string; code: string }, childId: string): string {
    const now = Math.floor(Date.now() / 1000);
    return this.sign({
      jti: randomBytes(16).toString('hex'),
      role: 'child',
      familyId: family.id,
      familyCode: family.code,
      childId,
      iat: now,
      exp: now + TOKEN_TTL_SECONDS,
    });
  }

  verifyToken(authHeader?: string): AuthTokenPayload {
    const raw = this.extractBearer(authHeader);
    const [encoded, sig] = raw.split('.');
    if (!encoded || !sig) {
      throw new UnauthorizedException('malformed token');
    }

    const expected = createHmac('sha256', this.secret).update(encoded).digest();
    let provided: Buffer;
    try {
      provided = fromBase64Url(sig);
    } catch {
      throw new UnauthorizedException('invalid token signature');
    }
    if (
      provided.length !== expected.length ||
      !timingSafeEqual(provided, expected)
    ) {
      throw new UnauthorizedException('invalid token signature');
    }

    let parsed: Partial<AuthTokenPayload>;
    try {
      parsed = JSON.parse(fromBase64Url(encoded).toString('utf8')) as Partial<AuthTokenPayload>;
    } catch {
      throw new UnauthorizedException('invalid token payload');
    }

    const now = Math.floor(Date.now() / 1000);
    if (
      typeof parsed.jti !== 'string' ||
      (parsed.role !== 'parent' && parsed.role !== 'child') ||
      typeof parsed.familyId !== 'string' ||
      typeof parsed.familyCode !== 'string' ||
      typeof parsed.exp !== 'number' ||
      parsed.exp <= now
    ) {
      throw new UnauthorizedException('token expired or invalid');
    }

    this.pruneRevoked(now);
    if (this.revoked.has(parsed.jti)) {
      throw new UnauthorizedException('session has been signed out');
    }

    return parsed as AuthTokenPayload;
  }

  async parentLogin(body: unknown) {
    const input = (body ?? {}) as Record<string, unknown>;
    const code = normalizeCode(input.familyCode);
    await this.families.verifyParent(code, input.pin);
    const found = await this.families.findByCode(code);
    const token = this.issueParentToken({ id: found.id, code: found.code });
    return {
      token,
      role: 'parent' as const,
      family: {
        id: found.id,
        name: found.name,
        code: found.code,
        hasPin: found.hasPin,
      },
      children: found.children,
    };
  }

  async childLogin(body: unknown) {
    const input = (body ?? {}) as Record<string, unknown>;
    const code = normalizeCode(input.familyCode);
    if (typeof input.childId !== 'string' || input.childId.trim() === '') {
      throw new BadRequestException('childId must be a non-empty string');
    }

    const found = await this.families.findByCode(code);
    const child = found.children.find((item) => item.id === input.childId);
    if (!child) {
      throw new NotFoundException('child profile not found in this family');
    }

    const token = this.issueChildToken({ id: found.id, code: found.code }, child.id);
    return {
      token,
      role: 'child' as const,
      family: {
        id: found.id,
        name: found.name,
        code: found.code,
        hasPin: found.hasPin,
      },
      child,
    };
  }

  async getMe(authHeader?: string) {
    const claims = this.verifyToken(authHeader);

    const family = await this.prisma.family.findUnique({
      where: { id: claims.familyId },
      select: { id: true, name: true, code: true, pinHash: true },
    });
    if (!family || family.code !== claims.familyCode) {
      throw new UnauthorizedException('family no longer exists');
    }

    const publicFamily = {
      id: family.id,
      name: family.name,
      code: family.code,
      hasPin: family.pinHash !== null,
    };

    if (claims.role === 'child') {
      if (!claims.childId) {
        throw new UnauthorizedException('invalid child session');
      }
      const child = await this.prisma.child.findUnique({
        where: { id: claims.childId },
      });
      if (!child || child.familyId !== family.id) {
        throw new UnauthorizedException('child profile no longer exists');
      }
      return {
        role: 'child' as const,
        family: publicFamily,
        child,
      };
    }

    return {
      role: 'parent' as const,
      family: publicFamily,
      child: null,
    };
  }

  logout(authHeader?: string) {
    if (authHeader) {
      try {
        const claims = this.verifyToken(authHeader);
        this.revoked.set(claims.jti, claims.exp);
      } catch {
        // Already expired or invalid; treat logout as idempotent.
      }
    }
    return { ok: true as const };
  }
}
