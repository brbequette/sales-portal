CREATE TABLE "PromotionDraft" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "repId" TEXT,
  "campaignTemplateId" TEXT,
  "localProductId" TEXT,
  "zohoItemId" TEXT,
  "sourceUrl" TEXT,
  "giveawayName" TEXT,
  "giveawayImageUrl" TEXT,
  "referenceImages" JSONB,
  "bundleItems" JSONB NOT NULL,
  "marketingCopy" JSONB NOT NULL,
  "financials" JSONB NOT NULL,
  "flyerSmsImage" TEXT,
  "flyerEmailImage" TEXT,
  "createdBy" TEXT,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PromotionDraft_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PromotionDraft_sku_key" ON "PromotionDraft"("sku");
CREATE INDEX "PromotionDraft_status_idx" ON "PromotionDraft"("status");
CREATE INDEX "PromotionDraft_repId_idx" ON "PromotionDraft"("repId");
CREATE INDEX "PromotionDraft_campaignTemplateId_idx" ON "PromotionDraft"("campaignTemplateId");
CREATE INDEX "PromotionDraft_createdAt_idx" ON "PromotionDraft"("createdAt");
