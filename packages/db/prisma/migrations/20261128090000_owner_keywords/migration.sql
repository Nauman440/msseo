-- Keywords the owner chose at sign-up.
ALTER TABLE "CustomerAccount" ADD COLUMN "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[];
