-- CreateTable
CREATE TABLE "CompetitorWorkspace" (
    "domain" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetitorWorkspace_pkey" PRIMARY KEY ("domain")
);

