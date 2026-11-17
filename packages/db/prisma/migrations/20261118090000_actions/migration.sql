-- CreateTable
CREATE TABLE "ActionWorkspace" (
    "domain" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActionWorkspace_pkey" PRIMARY KEY ("domain")
);

