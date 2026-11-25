-- CreateTable
CREATE TABLE "SiteInventory" (
    "accountId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "refreshedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteInventory_pkey" PRIMARY KEY ("accountId","domain")
);

-- CreateIndex
CREATE INDEX "SiteInventory_domain_idx" ON "SiteInventory"("domain");
