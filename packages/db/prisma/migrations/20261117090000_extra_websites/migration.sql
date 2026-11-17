-- AlterTable
ALTER TABLE "CustomerAccount" ADD COLUMN     "extraWebsites" TEXT[];


-- CreateTable
CREATE TABLE "AiCache" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiCache_pkey" PRIMARY KEY ("key")
);
