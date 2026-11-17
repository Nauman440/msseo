-- CreateTable
CREATE TABLE "CompetitorAnalysis" (
    "domain" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetitorAnalysis_pkey" PRIMARY KEY ("domain")
);

