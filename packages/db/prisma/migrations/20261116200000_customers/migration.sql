-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'customer';

-- AlterTable
ALTER TABLE "Audit" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'team';

-- CreateTable
CREATE TABLE "CustomerAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "phone" TEXT,
    "plan" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'trial',
    "trialEndsAt" TIMESTAMP(3) NOT NULL,
    "website" TEXT,
    "projectId" TEXT,
    "sourceAuditId" TEXT,
    "country" TEXT,
    "areas" TEXT[],
    "otherCountries" BOOLEAN NOT NULL DEFAULT false,
    "language" TEXT,
    "services" TEXT[],
    "competitors" TEXT[],
    "connections" TEXT[],
    "consentChanges" BOOLEAN NOT NULL DEFAULT false,
    "consentAt" TIMESTAMP(3),
    "onboardingStep" INTEGER NOT NULL DEFAULT 2,
    "onboardedAt" TIMESTAMP(3),
    "lastAutoAuditAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerAccount_userId_key" ON "CustomerAccount"("userId");

-- CreateIndex
CREATE INDEX "Audit_source_createdAt_idx" ON "Audit"("source", "createdAt");

-- AddForeignKey
ALTER TABLE "CustomerAccount" ADD CONSTRAINT "CustomerAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAccount" ADD CONSTRAINT "CustomerAccount_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

