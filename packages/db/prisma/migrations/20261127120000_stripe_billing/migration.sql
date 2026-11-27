-- Stripe billing for the sign-up trial.
ALTER TABLE "CustomerAccount" ADD COLUMN "stripeCustomerId" TEXT;
ALTER TABLE "CustomerAccount" ADD COLUMN "stripeSubscriptionId" TEXT;
ALTER TABLE "CustomerAccount" ADD COLUMN "billingStatus" TEXT;
CREATE UNIQUE INDEX "CustomerAccount_stripeSubscriptionId_key" ON "CustomerAccount"("stripeSubscriptionId");
