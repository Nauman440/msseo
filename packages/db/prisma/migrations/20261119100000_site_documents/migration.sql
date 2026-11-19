-- CreateTable
CREATE TABLE "SiteDocument" (
    "kind" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteDocument_pkey" PRIMARY KEY ("kind","domain")
);

