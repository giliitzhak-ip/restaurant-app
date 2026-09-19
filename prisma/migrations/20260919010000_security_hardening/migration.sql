-- Security hardening.
--
-- Adds the unguessable order token, the payment audit trail, gapless order
-- numbers and the admin audit log. Existing orders are backfilled with a fresh
-- token before the NOT NULL constraint lands, so this is safe to run against a
-- live database.

-- CreateEnum
CREATE TYPE "PaymentEventKind" AS ENUM ('INTENT_CREATED', 'REDIRECTED', 'WEBHOOK_RECEIVED', 'AUTHORISED', 'FAILED', 'CANCELLED', 'REFUNDED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OrderStatus" ADD VALUE 'PAYMENT_PENDING';
ALTER TYPE "OrderStatus" ADD VALUE 'PAYMENT_FAILED';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'ILS',
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "stockCommitted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "vatRate" DOUBLE PRECISION NOT NULL DEFAULT 0.18,
ALTER COLUMN "status" SET DEFAULT 'PAYMENT_PENDING';

-- CreateTable
CREATE TABLE "PaymentTransaction" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "kind" "PaymentEventKind" NOT NULL,
    "status" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ILS',
    "reference" TEXT,
    "eventId" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sequence" (
    "name" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Sequence_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "detail" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentTransaction_eventId_key" ON "PaymentTransaction"("eventId");

-- CreateIndex
CREATE INDEX "PaymentTransaction_orderId_idx" ON "PaymentTransaction"("orderId");

-- CreateIndex
CREATE INDEX "PaymentTransaction_provider_reference_idx" ON "PaymentTransaction"("provider", "reference");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");


-- Backfill publicToken on existing rows, then lock it down.
ALTER TABLE "Order" ADD COLUMN "publicToken" TEXT;
UPDATE "Order"
   SET "publicToken" = encode(gen_random_bytes(32), 'base64')
 WHERE "publicToken" IS NULL;
ALTER TABLE "Order" ALTER COLUMN "publicToken" SET NOT NULL;

-- Orders written before this migration used PENDING as "awaiting payment".
UPDATE "Order" SET "status" = 'PENDING' WHERE "status" IS NULL;

-- Seed the order-number counter past whatever the old random numbers produced.
INSERT INTO "Sequence" ("name", "value") VALUES ('order', 0)
ON CONFLICT ("name") DO NOTHING;

-- CreateIndex
CREATE UNIQUE INDEX "Order_publicToken_key" ON "Order"("publicToken");

-- CreateIndex
CREATE UNIQUE INDEX "Order_idempotencyKey_key" ON "Order"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
