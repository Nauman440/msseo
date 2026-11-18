-- CreateTable
CREATE TABLE "SiteConnection" (
    "domain" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteConnection_pkey" PRIMARY KEY ("domain")
);

