-- CreateTable
CREATE TABLE "MappingWorkspace" (
    "domain" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MappingWorkspace_pkey" PRIMARY KEY ("domain")
);

