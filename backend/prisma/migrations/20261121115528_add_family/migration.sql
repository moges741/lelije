-- CreateTable
CREATE TABLE "Family" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Family_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Family_code_key" ON "Family"("code");

-- AlterTable: every child must belong to a family. Children created before
-- families existed are kept and placed under one "Test family". On an empty
-- database no family is inserted.
ALTER TABLE "Child" ADD COLUMN "familyId" TEXT;

INSERT INTO "Family" ("id", "name", "code")
SELECT gen_random_uuid()::text, 'Test family', 'LJ-TEST01'
WHERE EXISTS (SELECT 1 FROM "Child");

UPDATE "Child"
SET "familyId" = (SELECT "id" FROM "Family" WHERE "code" = 'LJ-TEST01');

ALTER TABLE "Child" ALTER COLUMN "familyId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Child" ADD CONSTRAINT "Child_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;
