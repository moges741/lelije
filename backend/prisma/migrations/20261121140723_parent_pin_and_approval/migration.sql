-- AlterTable: completions saved before approval existed were awarded at once,
-- so they are marked approved. New rows must always set a status explicitly.
ALTER TABLE "Completion" ADD COLUMN "reviewedAt" TIMESTAMP(3),
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'approved';

ALTER TABLE "Completion" ALTER COLUMN "status" DROP DEFAULT;

-- AlterTable: families created before the PIN existed have none until a parent sets one.
ALTER TABLE "Family" ADD COLUMN "pinFailures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "pinHash" TEXT,
ADD COLUMN "pinLockedUntil" TIMESTAMP(3);
