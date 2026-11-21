import { BadRequestException } from '@nestjs/common';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keyLength: number,
) => Promise<Buffer>;

const KEY_LENGTH = 32;

/** A PIN is exactly 4 digits, sent as a string so a leading zero survives. */
export function parsePin(value: unknown, field = 'pin'): string {
  if (typeof value !== 'string' || !/^\d{4}$/.test(value)) {
    throw new BadRequestException(`${field} must be a string of 4 digits`);
  }
  return value;
}

/** Returns "salt:hash" in hex; the PIN itself is never stored. */
export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(pin, salt, KEY_LENGTH);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export async function pinMatches(pin: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(':');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scryptAsync(
    pin,
    Buffer.from(saltHex, 'hex'),
    expected.length,
  );
  return timingSafeEqual(actual, expected);
}
