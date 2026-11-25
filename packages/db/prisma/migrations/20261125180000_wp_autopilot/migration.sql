-- CreateTable
CREATE TABLE "WpAutopilot" (
    "accountId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WpAutopilot_pkey" PRIMARY KEY ("accountId","domain")
);

-- CreateIndex
CREATE INDEX "WpAutopilot_domain_idx" ON "WpAutopilot"("domain");
