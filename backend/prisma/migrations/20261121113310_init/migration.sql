-- CreateTable
CREATE TABLE "Child" (
    "id" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "language" TEXT NOT NULL,
    "nickname" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Child_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyMission" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "missions" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyMission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Completion" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "verifiedBy" TEXT NOT NULL,
    "result" JSONB,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Completion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameResult" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyMission_childId_day_key" ON "DailyMission"("childId", "day");

-- CreateIndex
CREATE INDEX "Completion_childId_day_idx" ON "Completion"("childId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "Completion_childId_missionId_day_key" ON "Completion"("childId", "missionId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "GameResult_childId_day_game_key" ON "GameResult"("childId", "day", "game");

-- AddForeignKey
ALTER TABLE "DailyMission" ADD CONSTRAINT "DailyMission_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Completion" ADD CONSTRAINT "Completion_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameResult" ADD CONSTRAINT "GameResult_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;
