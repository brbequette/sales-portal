-- CreateTable: SalesStage
CREATE TABLE "SalesStage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6b7280',
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "autoActions" JSONB,
    "notifications" JSONB,
    "transitionRule" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesStage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: SalesStage slug unique
CREATE UNIQUE INDEX "SalesStage_slug_key" ON "SalesStage"("slug");

-- CreateTable: NotificationTemplate
CREATE TABLE "NotificationTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY ("id")
);

-- AlterTable: Deal — add salesStageId column
ALTER TABLE "Deal" ADD COLUMN "salesStageId" TEXT;

-- CreateIndex: Deal salesStageId
CREATE INDEX "Deal_salesStageId_idx" ON "Deal"("salesStageId");

-- Seed: Insert 11 default sales stages
INSERT INTO "SalesStage" ("id", "name", "slug", "order", "color", "isDefault", "createdAt", "updatedAt") VALUES
  (gen_random_uuid()::text, 'Estimate Created',              'estimate-created',              1,  '#3b82f6', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'Sales Order Created',           'sales-order-created',           2,  '#8b5cf6', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'PO Issued',                     'po-issued',                     3,  '#f59e0b', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'All Shipped',                   'all-shipped',                   4,  '#06b6d4', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'Converted To Invoice',          'converted-to-invoice',          5,  '#10b981', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'INV. Overdue',                  'inv-overdue',                   6,  '#ef4444', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'Write-Off',                     'write-off',                     7,  '#6b7280', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'Invoice Paid',                  'invoice-paid',                  8,  '#22c55e', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'Paid Needs Final Gift Sent',    'paid-needs-final-gift-sent',    9,  '#a855f7', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'Sales Cycle Complete',          'sales-cycle-complete',          10, '#059669', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'Closed Lost',                   'closed-lost',                  11, '#dc2626', true, NOW(), NOW());
