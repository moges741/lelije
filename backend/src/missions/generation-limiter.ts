import { Injectable } from '@nestjs/common';

const WINDOW_MS = 60 * 60 * 1000;
export const MAX_GENERATIONS_PER_HOUR = 10;

/**
 * Caps how often one family can trigger mission generation (an LLM call).
 * Kept in memory, which is enough for a single server process.
 */
@Injectable()
export class GenerationLimiter {
  private readonly generations = new Map<string, number[]>();

  /** Records a generation and returns true, or returns false when over the cap. */
  tryConsume(familyId: string, now: number = Date.now()): boolean {
    const recent = (this.generations.get(familyId) ?? []).filter(
      (time) => now - time < WINDOW_MS,
    );
    if (recent.length >= MAX_GENERATIONS_PER_HOUR) {
      this.generations.set(familyId, recent);
      return false;
    }
    recent.push(now);
    this.generations.set(familyId, recent);
    return true;
  }
}
