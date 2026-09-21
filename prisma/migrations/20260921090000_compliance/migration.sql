-- CreateEnum
CREATE TYPE "ConsentKind" AS ENUM ('COOKIES', 'PURCHASE_TERMS', 'MARKETING');

-- CreateEnum
CREATE TYPE "ConsentSource" AS ENUM ('COOKIE_BANNER', 'PRIVACY_SETTINGS', 'CHECKOUT', 'NEWSLETTER_FORM', 'ACCOUNT_SETTINGS', 'UNSUBSCRIBE_LINK');

-- CreateEnum
CREATE TYPE "CancellationStatus" AS ENUM ('RECEIVED', 'IN_REVIEW', 'APPROVED', 'PARTIALLY_APPROVED', 'DECLINED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "DataRequestKind" AS ENUM ('ACCESS', 'RECTIFY', 'DELETE', 'EXPORT');

-- CreateEnum
CREATE TYPE "DataRequestStatus" AS ENUM ('RECEIVED', 'IDENTITY_PENDING', 'IN_PROGRESS', 'COMPLETED', 'REFUSED_RETENTION_REQUIRED', 'REJECTED');

-- AlterTable
ALTER TABLE "NewsletterSignup" ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "consentText" TEXT,
ADD COLUMN     "documentVersion" TEXT,
ADD COLUMN     "ipPrefix" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'FOOTER',
ADD COLUMN     "unsubscribedAt" TIMESTAMP(3);

-- Backfill: unsubscribeToken is NOT NULL UNIQUE, and rows already exist.
--
-- Prisma emits this as a bare NOT NULL column, which fails on a table with any
-- data in it. Added nullable, filled with a random value per row, then
-- tightened. gen_random_uuid() is in pgcrypto, which ships with Postgres 13+
-- as a built-in, so nothing extra has to be installed.
ALTER TABLE "NewsletterSignup" ADD COLUMN "unsubscribeToken" TEXT;
UPDATE "NewsletterSignup"
   SET "unsubscribeToken" = replace(gen_random_uuid()::text, '-', '')
 WHERE "unsubscribeToken" IS NULL;
ALTER TABLE "NewsletterSignup" ALTER COLUMN "unsubscribeToken" SET NOT NULL;

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "kind" "ConsentKind" NOT NULL,
    "source" "ConsentSource" NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "userId" TEXT,
    "email" TEXT,
    "subjectKey" TEXT,
    "documentVersion" TEXT NOT NULL,
    "categories" JSONB,
    "ipPrefix" TEXT,
    "userAgentHash" TEXT,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingSuppression" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingSuppression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CancellationRequest" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "orderId" TEXT,
    "orderNumber" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "reason" TEXT,
    "attachmentKey" TEXT,
    "status" "CancellationStatus" NOT NULL DEFAULT 'RECEIVED',
    "decisionNote" TEXT,
    "handledById" TEXT,
    "handledAt" TIMESTAMP(3),
    "ipPrefix" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CancellationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataRequest" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "kind" "DataRequestKind" NOT NULL,
    "status" "DataRequestStatus" NOT NULL DEFAULT 'RECEIVED',
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "detail" TEXT,
    "identityNote" TEXT,
    "retentionBasis" TEXT,
    "handledById" TEXT,
    "handledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsentRecord_kind_createdAt_idx" ON "ConsentRecord"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "ConsentRecord_email_idx" ON "ConsentRecord"("email");

-- CreateIndex
CREATE INDEX "ConsentRecord_subjectKey_idx" ON "ConsentRecord"("subjectKey");

-- CreateIndex
CREATE INDEX "ConsentRecord_orderId_idx" ON "ConsentRecord"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingSuppression_email_key" ON "MarketingSuppression"("email");

-- CreateIndex
CREATE UNIQUE INDEX "CancellationRequest_reference_key" ON "CancellationRequest"("reference");

-- CreateIndex
CREATE INDEX "CancellationRequest_status_createdAt_idx" ON "CancellationRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CancellationRequest_orderNumber_idx" ON "CancellationRequest"("orderNumber");

-- CreateIndex
CREATE INDEX "CancellationRequest_email_idx" ON "CancellationRequest"("email");

-- CreateIndex
CREATE UNIQUE INDEX "DataRequest_reference_key" ON "DataRequest"("reference");

-- CreateIndex
CREATE INDEX "DataRequest_status_createdAt_idx" ON "DataRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "DataRequest_email_idx" ON "DataRequest"("email");

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterSignup_unsubscribeToken_key" ON "NewsletterSignup"("unsubscribeToken");

-- CreateIndex
CREATE INDEX "NewsletterSignup_confirmedAt_idx" ON "NewsletterSignup"("confirmedAt");

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CancellationRequest" ADD CONSTRAINT "CancellationRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

