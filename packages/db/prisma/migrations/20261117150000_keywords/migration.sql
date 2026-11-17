-- CreateTable
CREATE TABLE "KeywordWorkspace" (
    "domain" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KeywordWorkspace_pkey" PRIMARY KEY ("domain")
);

