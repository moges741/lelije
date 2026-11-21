import { Prisma } from '@prisma/client';
import { addisDay, daysAgo } from '../common/day';
import { hashPin } from '../families/pin';
import type { Mission } from '../missions/missions.types';
import type { PrismaService } from './prisma.service';

export const DEMO_FAMILY_CODE = 'LELIJE';
export const DEMO_FAMILY_PIN = '1234';

function liaMissions(): Mission[] {
  return [
    {
      id: 'demo-en-jump',
      title: 'Starlight Jumps',
      description: 'Jump 6 times like you are tapping stars in the sky.',
      type: 'physical',
      durationMin: 3,
      points: 20,
      verification: 'pose',
      goal: { detector: 'jump', count: 6 },
      language: 'en',
      ageMin: 5,
      ageMax: 12,
      tags: ['indoor', 'cardio'],
    },
    {
      id: 'demo-en-tidy',
      title: 'Tidy Hero',
      description: 'Put away 5 books or toys and show a parent your tidy corner.',
      type: 'helper',
      durationMin: 4,
      points: 15,
      verification: 'self',
      language: 'en',
      ageMin: 5,
      ageMax: 12,
      tags: ['indoor', 'helper'],
    },
    {
      id: 'demo-en-arms',
      title: 'Tall Tree Stretch',
      description: 'Reach both arms high above your head 5 times like a tall tree.',
      type: 'physical',
      durationMin: 3,
      points: 15,
      verification: 'pose',
      goal: { detector: 'armsUp', count: 5 },
      language: 'en',
      ageMin: 5,
      ageMax: 12,
      tags: ['indoor', 'stretch'],
    },
  ];
}

function bekaMissions(): Mission[] {
  return [
    {
      id: 'demo-am-jump',
      title: 'የኮከብ ዝላይ',
      description: 'እንደ ኮከብ ለመንካት 8 ጊዜ ወደ ላይ ዝለል።',
      type: 'physical',
      durationMin: 3,
      points: 20,
      verification: 'pose',
      goal: { detector: 'jump', count: 8 },
      language: 'am',
      ageMin: 6,
      ageMax: 13,
      tags: ['indoor', 'cardio'],
    },
    {
      id: 'demo-am-help',
      title: 'የቤት ረዳት',
      description: 'ጠረጴዛውን ወይም መጽሐፎችህን በንጽህና አስተካክልና ለወላጅ አሳይ።',
      type: 'helper',
      durationMin: 4,
      points: 15,
      verification: 'self',
      language: 'am',
      ageMin: 6,
      ageMax: 13,
      tags: ['indoor', 'helper'],
    },
    {
      id: 'demo-am-arms',
      title: 'የዛፍ ዝርጋታ',
      description: 'ሁለቱንም እጆችህን 6 ጊዜ ወደ ሰማይ ዘርጋ።',
      type: 'physical',
      durationMin: 3,
      points: 15,
      verification: 'pose',
      goal: { detector: 'armsUp', count: 6 },
      language: 'am',
      ageMin: 6,
      ageMax: 13,
      tags: ['indoor', 'stretch'],
    },
  ];
}

/**
 * Seeds a fixed multilingual demo family (`LELIJE`, PIN `1234`) on startup if
 * it does not already exist. Safe and idempotent on both PostgreSQL and the
 * in-memory fallback store. Set `SEED_DEMO_FAMILY=false` to disable.
 */
export async function seedDemoFamily(prisma: PrismaService): Promise<boolean> {
  if (process.env.SEED_DEMO_FAMILY === 'false') return false;

  const existing = await prisma.family.findUnique({
    where: { code: DEMO_FAMILY_CODE },
    select: { id: true },
  });
  if (existing) return false;

  const today = addisDay();
  const yesterday = daysAgo(today, 1);
  const twoDaysAgo = daysAgo(today, 2);
  const now = new Date();
  const yesterdayAt = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const twoDaysAgoAt = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  const pinHash = await hashPin(DEMO_FAMILY_PIN);
  const family = await prisma.family.create({
    data: {
      name: 'LeLije Demo Family',
      code: DEMO_FAMILY_CODE,
      pinHash,
    },
  });

  const lia = await prisma.child.create({
    data: { familyId: family.id, nickname: 'Lia', age: 7, language: 'en' },
  });
  const beka = await prisma.child.create({
    data: { familyId: family.id, nickname: 'Beka', age: 9, language: 'am' },
  });
  await prisma.child.create({
    data: { familyId: family.id, nickname: 'Chaltu', age: 6, language: 'om' },
  });

  const liaList = liaMissions();
  const bekaList = bekaMissions();

  // Today's missions for Lia and Beka (Chaltu stays fresh so testers can trigger generation)
  await prisma.dailyMission.create({
    data: {
      childId: lia.id,
      day: today,
      missions: liaList as unknown as Prisma.InputJsonValue,
      source: 'fallback',
    },
  });
  await prisma.dailyMission.create({
    data: {
      childId: beka.id,
      day: today,
      missions: bekaList as unknown as Prisma.InputJsonValue,
      source: 'fallback',
    },
  });

  // Lia: yesterday completion + game (2-day streak), today pose approved + self pending + open play request
  await prisma.completion.create({
    data: {
      childId: lia.id,
      missionId: 'demo-en-jump',
      day: yesterday,
      status: 'approved',
      points: 20,
      verifiedBy: 'pose',
      result: { count: 6, durationMs: 18_000 } as Prisma.InputJsonValue,
      completedAt: yesterdayAt,
      reviewedAt: yesterdayAt,
    },
  });
  await prisma.gameResult.create({
    data: {
      childId: lia.id,
      day: yesterday,
      game: 'catch-the-stars',
      score: 26,
      points: 13,
      result: {
        score: 26,
        starsCaught: 10,
        goldenCaught: 2,
        jumps: 9,
        armsUp: 4,
        durationMs: 45000,
      } as Prisma.InputJsonValue,
      createdAt: yesterdayAt,
    },
  });
  await prisma.completion.create({
    data: {
      childId: lia.id,
      missionId: 'demo-en-jump',
      day: today,
      status: 'approved',
      points: 20,
      verifiedBy: 'pose',
      result: { count: 6, durationMs: 16_000 } as Prisma.InputJsonValue,
      completedAt: new Date(now.getTime() - 25 * 60 * 1000),
      reviewedAt: new Date(now.getTime() - 25 * 60 * 1000),
    },
  });
  await prisma.completion.create({
    data: {
      childId: lia.id,
      missionId: 'demo-en-tidy',
      day: today,
      status: 'pending',
      points: 0,
      verifiedBy: 'self',
      completedAt: new Date(now.getTime() - 10 * 60 * 1000),
    },
  });
  await prisma.playRequest.create({
    data: {
      childId: lia.id,
      day: today,
      status: 'sent',
      requestedAt: new Date(now.getTime() - 5 * 60 * 1000),
    },
  });
  await prisma.notification.create({
    data: {
      familyId: family.id,
      childId: lia.id,
      audience: 'parent',
      kind: 'mission_pending',
      read: false,
      createdAt: new Date(now.getTime() - 10 * 60 * 1000),
    },
  });
  await prisma.notification.create({
    data: {
      familyId: family.id,
      childId: lia.id,
      audience: 'parent',
      kind: 'play_sent',
      read: false,
      createdAt: new Date(now.getTime() - 5 * 60 * 1000),
    },
  });

  // Beka: 3-day streak + unread child notification
  await prisma.completion.create({
    data: {
      childId: beka.id,
      missionId: 'demo-am-jump',
      day: twoDaysAgo,
      status: 'approved',
      points: 20,
      verifiedBy: 'pose',
      result: { count: 8, durationMs: 21_000 } as Prisma.InputJsonValue,
      completedAt: twoDaysAgoAt,
      reviewedAt: twoDaysAgoAt,
    },
  });
  await prisma.completion.create({
    data: {
      childId: beka.id,
      missionId: 'demo-am-jump',
      day: yesterday,
      status: 'approved',
      points: 20,
      verifiedBy: 'pose',
      result: { count: 8, durationMs: 20_000 } as Prisma.InputJsonValue,
      completedAt: yesterdayAt,
      reviewedAt: yesterdayAt,
    },
  });
  await prisma.completion.create({
    data: {
      childId: beka.id,
      missionId: 'demo-am-help',
      day: today,
      status: 'approved',
      points: 15,
      verifiedBy: 'self',
      completedAt: new Date(now.getTime() - 40 * 60 * 1000),
      reviewedAt: new Date(now.getTime() - 35 * 60 * 1000),
    },
  });
  await prisma.notification.create({
    data: {
      familyId: family.id,
      childId: beka.id,
      audience: 'child',
      kind: 'mission_approved',
      read: false,
      createdAt: new Date(now.getTime() - 35 * 60 * 1000),
    },
  });

  return true;
}
