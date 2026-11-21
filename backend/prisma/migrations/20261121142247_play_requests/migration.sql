-- CreateTable
CREATE TABLE "PlayRequest" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),

    CONSTRAINT "PlayRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlayRequest_childId_status_idx" ON "PlayRequest"("childId", "status");

-- AddForeignKey
ALTER TABLE "PlayRequest" ADD CONSTRAINT "PlayRequest_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;
