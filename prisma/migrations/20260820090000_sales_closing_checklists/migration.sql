CREATE TABLE "SalesClosingChecklist" (
  "documentId" TEXT NOT NULL,
  "paymentVerified" BOOLEAN NOT NULL DEFAULT false,
  "giftSent" BOOLEAN NOT NULL DEFAULT false,
  "satisfactionChecked" BOOLEAN NOT NULL DEFAULT false,
  "completedAt" TIMESTAMP(3),
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SalesClosingChecklist_pkey" PRIMARY KEY ("documentId")
);
