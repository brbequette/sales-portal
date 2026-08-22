-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MANAGER', 'AGENT', 'VIEWER');

-- CreateEnum
CREATE TYPE "AccountQuality" AS ENUM ('A_PLUS', 'A', 'B', 'C', 'D', 'NEVER_STATUSED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID');

-- CreateEnum
CREATE TYPE "PayoutStructure" AS ENUM ('TWO_PAYMENT', 'THREE_PAYMENT', 'SINGLE_PAYMENT');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "name" TEXT,
    "phone" TEXT,
    "title" TEXT DEFAULT 'Sales Representative',
    "vcardPhotoUrl" TEXT,
    "vcardCompany" TEXT DEFAULT 'Titan Diamond USA',
    "vcardWebsite" TEXT DEFAULT 'https://tdusales.com',
    "zohoId" TEXT,
    "role" TEXT NOT NULL DEFAULT 'AGENT',
    "autoAttachVCard" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "constantVigEnabled" BOOLEAN NOT NULL DEFAULT false,
    "constantVigValue" DOUBLE PRECISION DEFAULT 1.5,
    "canSendCampaigns" BOOLEAN NOT NULL DEFAULT false,
    "permissions" JSONB,
    "showOnSalesBoard" BOOLEAN NOT NULL DEFAULT false,
    "payoutStructure" TEXT NOT NULL DEFAULT 'two_payment',

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "zohoId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "industry" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Update Status',
    "lastPurchaseAt" TIMESTAMP(3),
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "nextActionDate" TIMESTAMP(3),
    "tags" TEXT,
    "quality" TEXT NOT NULL DEFAULT 'NEVER_STATUSED',
    "lastCalledAt" TIMESTAMP(3),
    "lastClosedCycleAt" TIMESTAMP(3),
    "timeZone" TEXT,
    "bladeSizes" TEXT,
    "materialsCut" TEXT,
    "currentSupplier" TEXT,
    "averageBladeCost" TEXT,
    "crewCount" TEXT,
    "bladesPerOrder" TEXT,
    "improvementPriority" TEXT,
    "billingStreet" TEXT,
    "billingCity" TEXT,
    "billingState" TEXT,
    "billingZip" TEXT,
    "shippingStreet" TEXT,
    "shippingCity" TEXT,
    "shippingState" TEXT,
    "shippingZip" TEXT,
    "zohoModifiedTime" TIMESTAMP(3),
    "rawData" JSONB,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "zohoId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "mobilePhone" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "designation" TEXT,
    "mailingStreet" TEXT,
    "mailingCity" TEXT,
    "mailingState" TEXT,
    "mailingZip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "zohoModifiedTime" TIMESTAMP(3),
    "rawData" JSONB,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL,
    "zohoId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'Open',
    "salesStageId" TEXT,
    "closingDate" TIMESTAMP(3),
    "invoicedItems" TEXT,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "zohoModifiedTime" TIMESTAMP(3),
    "rawData" JSONB,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrder" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "orderDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "items" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "zohoId" TEXT,
    "zohoModifiedTime" TIMESTAMP(3),
    "rawData" JSONB,
    "pendingCostSync" BOOLEAN NOT NULL DEFAULT false,
    "costsCalculatedAt" TIMESTAMP(3),
    "lastCostSyncAt" TIMESTAMP(3),
    "dealId" TEXT,
    "actualShippingCost" DOUBLE PRECISION,
    "shippingCostBreakdown" TEXT,
    "lastZohoModifiedTime" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "appModifiedAt" TIMESTAMP(3),
    "syncConflict" BOOLEAN NOT NULL DEFAULT false,
    "conflictFields" JSONB,
    "pendingZohoFetch" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SalesOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "validUntil" TIMESTAMP(3),
    "items" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "zohoId" TEXT,
    "zohoModifiedTime" TIMESTAMP(3),
    "rawData" JSONB,
    "pendingCostSync" BOOLEAN NOT NULL DEFAULT false,
    "costsCalculatedAt" TIMESTAMP(3),
    "lastCostSyncAt" TIMESTAMP(3),
    "dealId" TEXT,
    "lastZohoModifiedTime" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "appModifiedAt" TIMESTAMP(3),
    "syncConflict" BOOLEAN NOT NULL DEFAULT false,
    "conflictFields" JSONB,
    "pendingZohoFetch" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'General',
    "stock" INTEGER NOT NULL DEFAULT 0,
    "subjectToVig" BOOLEAN NOT NULL DEFAULT true,
    "giftItem" BOOLEAN NOT NULL DEFAULT false,
    "size" TEXT,
    "application" TEXT,
    "manufacturer" TEXT,
    "vendor" TEXT,
    "qualityTier" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "zohoId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "items" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "zohoModifiedTime" TIMESTAMP(3),
    "rawData" JSONB,
    "pendingCostSync" BOOLEAN NOT NULL DEFAULT false,
    "costsCalculatedAt" TIMESTAMP(3),
    "lastCostSyncAt" TIMESTAMP(3),
    "dealId" TEXT,
    "actualShippingCost" DOUBLE PRECISION,
    "shippingCostBreakdown" TEXT,
    "isWrittenOff" BOOLEAN NOT NULL DEFAULT false,
    "writtenOffAt" TIMESTAMP(3),
    "writtenOffCostDeduction" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "returnedItemsCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "returnedItemsRepHold" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "returnedItemsResold" BOOLEAN NOT NULL DEFAULT false,
    "resoldInvoiceId" TEXT,
    "lastZohoModifiedTime" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "appModifiedAt" TIMESTAMP(3),
    "syncConflict" BOOLEAN NOT NULL DEFAULT false,
    "conflictFields" JSONB,
    "pendingZohoFetch" BOOLEAN NOT NULL DEFAULT false,
    "paymentMade" DOUBLE PRECISION,
    "paymentExpected" DOUBLE PRECISION,
    "lastPaymentDate" TIMESTAMP(3),
    "balance" DOUBLE PRECISION,
    "clawbackDate" TIMESTAMP(3),
    "clawbackStatus" TEXT,
    "computedProfit" DOUBLE PRECISION,
    "computedDeadProfit" DOUBLE PRECISION,
    "computedDeadCost" DOUBLE PRECISION,
    "computedVigRate" DOUBLE PRECISION,
    "computedSalesperson" TEXT,
    "computedInvoiceNumber" TEXT,
    "computedUpfront" DOUBLE PRECISION,
    "computedFinal" DOUBLE PRECISION,
    "salesOrderZohoId" TEXT,
    "estimateZohoId" TEXT,
    "invoiceNumber" TEXT,
    "salesorderNumber" TEXT,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "callSid" TEXT,
    "sentiment" TEXT,
    "isAutoGenerated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "zohoId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Not Started',
    "priority" TEXT NOT NULL DEFAULT 'Normal',
    "dueDate" TIMESTAMP(3),
    "ownerId" TEXT NOT NULL,
    "accountId" TEXT,
    "dealId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "invoiceId" TEXT,
    "salesOrderId" TEXT,
    "quoteId" TEXT,
    "estimateId" TEXT,
    "type" TEXT NOT NULL DEFAULT 'Task',
    "reminderAt" TIMESTAMP(3),
    "reminderMethod" TEXT,
    "reminderFired" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "businessDefaults" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "CustomFieldMapping" (
    "id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "apiName" TEXT NOT NULL,
    "customfieldId" TEXT,
    "internalKey" TEXT NOT NULL,
    "dataType" TEXT NOT NULL DEFAULT 'string',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomFieldMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "repId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" TEXT NOT NULL DEFAULT 'Check',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyVigGoal" (
    "id" TEXT NOT NULL,
    "monthKey" TEXT NOT NULL,
    "repId" TEXT NOT NULL,
    "metric" TEXT NOT NULL DEFAULT 'PROFIT',
    "profitGoal" DOUBLE PRECISION NOT NULL DEFAULT 20000,
    "subtotalGoal" DOUBLE PRECISION NOT NULL DEFAULT 40000,
    "workingDays" INTEGER,
    "manualVigRate" DOUBLE PRECISION,
    "lastSyncedVigRate" DOUBLE PRECISION,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyVigGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "clockIn" TIMESTAMP(3) NOT NULL,
    "lastActivity" TIMESTAMP(3) NOT NULL,
    "clockOut" TIMESTAMP(3),
    "manualClockIn" TIMESTAMP(3),
    "manualClockOut" TIMESTAMP(3),
    "ipAddress" TEXT,
    "inactivityPeriods" JSONB DEFAULT '[]',
    "clockInLat" DOUBLE PRECISION,
    "clockInLng" DOUBLE PRECISION,
    "clockInAccuracy" DOUBLE PRECISION,
    "clockOutLat" DOUBLE PRECISION,
    "clockOutLng" DOUBLE PRECISION,
    "clockOutAccuracy" DOUBLE PRECISION,
    "clockInLocation" TEXT,
    "clockOutLocation" TEXT,
    "locationStatus" TEXT,
    "clockSource" TEXT DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeChangeRequest" (
    "id" TEXT NOT NULL,
    "timeEntryId" TEXT,
    "userId" TEXT NOT NULL,
    "requestedClockIn" TIMESTAMP(3),
    "requestedClockOut" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeofenceLocation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "radiusMeters" INTEGER NOT NULL DEFAULT 150,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeofenceLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "imageUrl" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'SMS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignBlast" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "imageUrl" TEXT,
    "channel" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignBlast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignJob" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "blastId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "campaignName" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'SMS',
    "text" TEXT NOT NULL DEFAULT '',
    "imageUrl" TEXT,
    "fromNumber" TEXT,
    "accountIds" JSONB NOT NULL,
    "currentIndex" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignLog" (
    "id" TEXT NOT NULL,
    "campaignBlastId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "contactId" TEXT,
    "zohoNumberUsed" TEXT,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsMessage" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "contactId" TEXT,
    "authorId" TEXT,
    "fromNumber" TEXT NOT NULL,
    "toNumber" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "zohoLogId" TEXT,
    "campaignBlastId" TEXT,
    "isAiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmsMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallScript" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "callType" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallScript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallLog" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "contactId" TEXT,
    "authorId" TEXT NOT NULL,
    "fromNumber" TEXT NOT NULL,
    "toNumber" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "duration" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "notes" TEXT,
    "transcript" TEXT,
    "zohoCallId" TEXT,
    "recordingUrl" TEXT,
    "zohoSentiment" TEXT,
    "aiSentiment" TEXT,
    "aiSummary" TEXT,
    "salesOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "editedAt" TIMESTAMP(3),

    CONSTRAINT "CallLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "url" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Advance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "splitOverWeeks" INTEGER,
    "deductionRate" DOUBLE PRECISION,
    "termWeeks" INTEGER,
    "termStartDate" TIMESTAMP(3),
    "termEndDate" TIMESTAMP(3),
    "interestRate" DOUBLE PRECISION,
    "agreedPayback" DOUBLE PRECISION,
    "amountPaidBack" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isFullyPaid" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Advance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reimbursement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "description" TEXT NOT NULL,
    "receiptUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "dateSubmitted" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateProcessed" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reimbursement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "zohoId" TEXT NOT NULL,
    "vendorName" TEXT,
    "shipToName" TEXT,
    "referenceNumber" TEXT,
    "date" TIMESTAMP(3),
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT,
    "items" JSONB,
    "salesOrderId" TEXT,
    "salesOrderNumber" TEXT,
    "isDropshipment" BOOLEAN NOT NULL DEFAULT false,
    "trackingNumber" TEXT,
    "invoiceId" TEXT,
    "invoiceNumber" TEXT,
    "isInventoryOrder" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "zohoId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "invoiceDbId" TEXT,
    "invoiceNumber" TEXT,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "date" TIMESTAMP(3),
    "mode" TEXT,
    "status" TEXT,
    "referenceNumber" TEXT,
    "bankCharges" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Package" (
    "id" TEXT NOT NULL,
    "zohoId" TEXT NOT NULL,
    "packageNumber" TEXT,
    "salesOrderId" TEXT,
    "salesOrderNumber" TEXT,
    "date" TIMESTAMP(3),
    "status" TEXT,
    "shippingCharge" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "carrier" TEXT,
    "trackingNumber" TEXT,
    "items" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Package_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "zohoId" TEXT NOT NULL,
    "contactName" TEXT,
    "companyName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "currencyId" TEXT,
    "paymentTerms" INTEGER,
    "billingAddress" JSONB,
    "shippingAddress" JSONB,
    "customFields" JSONB,
    "status" TEXT DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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
    "flowConfig" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "zohoId" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "mobile" TEXT,
    "title" TEXT,
    "industry" TEXT,
    "status" TEXT NOT NULL DEFAULT 'New Lead',
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastCalledAt" TIMESTAMP(3),
    "timeZone" TEXT,
    "bladeSizes" TEXT,
    "materialsCut" TEXT,
    "currentSupplier" TEXT,
    "averageBladeCost" TEXT,
    "crewCount" TEXT,
    "bladesPerOrder" TEXT,
    "improvementPriority" TEXT,
    "street" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "convertedAccountId" TEXT,
    "zohoModifiedTime" TIMESTAMP(3),
    "rawData" JSONB,
    "matchStatus" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "matchReason" TEXT,
    "companyGroupId" TEXT,
    "claimedById" TEXT,
    "claimedAt" TIMESTAMP(3),
    "claimedUntil" TIMESTAMP(3),
    "disposition" TEXT,
    "dispositionNotes" TEXT,
    "dispositionAt" TIMESTAMP(3),

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
CREATE TABLE "ScheduledMessage" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "campaignBlastId" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'SMS',
    "fromNumber" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "imageUrl" TEXT,
    "scheduledTime" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceGoalBonus" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "scope" TEXT NOT NULL DEFAULT 'INDIVIDUAL',
    "repId" TEXT,
    "repName" TEXT,
    "metric" TEXT NOT NULL DEFAULT 'SUBTOTAL',
    "targetValue" DOUBLE PRECISION NOT NULL,
    "bonusAmount" DOUBLE PRECISION NOT NULL,
    "cadence" TEXT NOT NULL DEFAULT 'MONTHLY',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerformanceGoalBonus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LineItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT,
    "salesOrderId" TEXT,
    "quoteId" TEXT,
    "zohoLineItemId" TEXT,
    "productName" TEXT NOT NULL,
    "sku" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClawbackTransaction" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "repId" TEXT NOT NULL,
    "monthKey" TEXT NOT NULL,
    "invoiceNumber" TEXT,
    "saleAmount" DOUBLE PRECISION NOT NULL,
    "deadCost" DOUBLE PRECISION NOT NULL,
    "shippingCost" DOUBLE PRECISION NOT NULL,
    "totalRepLoss" DOUBLE PRECISION NOT NULL,
    "commissionClawed" DOUBLE PRECISION NOT NULL,
    "triggerDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "cascadeImpact" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClawbackTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompensationPlan" (
    "id" TEXT NOT NULL,
    "repId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "payType" TEXT NOT NULL DEFAULT 'COMMISSION_ONLY',
    "baseAmount" DOUBLE PRECISION,
    "baseInterval" TEXT,
    "commissionEnabled" BOOLEAN NOT NULL DEFAULT true,
    "commissionRate" DOUBLE PRECISION,
    "commissionBasis" TEXT,
    "payoutStructure" TEXT NOT NULL DEFAULT 'two_payment',
    "drawRecoverable" BOOLEAN NOT NULL DEFAULT true,
    "drawCapPerPeriod" DOUBLE PRECISION,
    "commitmentEnabled" BOOLEAN NOT NULL DEFAULT false,
    "commitmentMetric" TEXT,
    "commitmentTarget" DOUBLE PRECISION,
    "commitmentVigRate" DOUBLE PRECISION,
    "commitmentGoalType" TEXT,
    "commitmentPenalty" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompensationPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BasePayEarning" (
    "id" TEXT NOT NULL,
    "repId" TEXT NOT NULL,
    "planId" TEXT,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "hoursWorked" DOUBLE PRECISION,
    "hourlyRate" DOUBLE PRECISION,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paidDate" TIMESTAMP(3),
    "payoutId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BasePayEarning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdvanceExtensionRequest" (
    "id" TEXT NOT NULL,
    "advanceId" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "additionalWeeks" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdvanceExtensionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiChatLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "userRole" TEXT,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "toolsUsed" TEXT,
    "responseTimeMs" INTEGER,
    "helpful" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiChatLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealAutomationState" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "salesStageId" TEXT NOT NULL,
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "loopCount" INTEGER NOT NULL DEFAULT 0,
    "maxLoops" INTEGER NOT NULL DEFAULT 3,
    "lastExecutedAt" TIMESTAMP(3),
    "nextExecuteAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealAutomationState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Email" (
    "id" TEXT NOT NULL,
    "accountId" TEXT,
    "contactId" TEXT,
    "userId" TEXT,
    "zohoMailId" TEXT NOT NULL,
    "zohoAccountId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT,
    "bodyHtml" TEXT,
    "fromAddress" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "ccAddresses" TEXT,
    "direction" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "threadId" TEXT,
    "needsResponse" BOOLEAN NOT NULL DEFAULT false,
    "suggestedReply" TEXT,
    "taskCreated" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Email_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "category" TEXT,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "isSystemDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcceptedResponse" (
    "id" TEXT NOT NULL,
    "emailId" TEXT,
    "originalSubject" TEXT,
    "responseBody" TEXT NOT NULL,
    "mergeTags" JSONB,
    "category" TEXT,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcceptedResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MagicLinkToken" (
    "id" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "accountId" TEXT,
    "contactId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MagicLinkToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoshipBundle" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "items" JSONB NOT NULL,
    "frequency" TEXT NOT NULL,
    "discountPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoshipBundle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoshipSubscription" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "frequency" TEXT NOT NULL,
    "nextShipDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoshipSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiCustomTool" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "parameters" JSONB NOT NULL,
    "endpointUrl" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'POST',
    "bodyTemplate" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiCustomTool_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_zohoId_key" ON "User"("zohoId");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "Account_zohoId_key" ON "Account"("zohoId");

-- CreateIndex
CREATE INDEX "Account_ownerId_idx" ON "Account"("ownerId");

-- CreateIndex
CREATE INDEX "Account_status_idx" ON "Account"("status");

-- CreateIndex
CREATE INDEX "Account_ownerId_quality_status_idx" ON "Account"("ownerId", "quality", "status");

-- CreateIndex
CREATE INDEX "Account_billingState_timeZone_idx" ON "Account"("billingState", "timeZone");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_zohoId_key" ON "Contact"("zohoId");

-- CreateIndex
CREATE UNIQUE INDEX "Deal_zohoId_key" ON "Deal"("zohoId");

-- CreateIndex
CREATE INDEX "Deal_ownerId_idx" ON "Deal"("ownerId");

-- CreateIndex
CREATE INDEX "Deal_accountId_idx" ON "Deal"("accountId");

-- CreateIndex
CREATE INDEX "Deal_salesStageId_idx" ON "Deal"("salesStageId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_zohoId_key" ON "SalesOrder"("zohoId");

-- CreateIndex
CREATE INDEX "SalesOrder_pendingCostSync_idx" ON "SalesOrder"("pendingCostSync");

-- CreateIndex
CREATE INDEX "SalesOrder_dealId_idx" ON "SalesOrder"("dealId");

-- CreateIndex
CREATE INDEX "SalesOrder_accountId_idx" ON "SalesOrder"("accountId");

-- CreateIndex
CREATE INDEX "SalesOrder_orderDate_idx" ON "SalesOrder"("orderDate");

-- CreateIndex
CREATE INDEX "SalesOrder_status_orderDate_idx" ON "SalesOrder"("status", "orderDate");

-- CreateIndex
CREATE INDEX "SalesOrder_syncConflict_idx" ON "SalesOrder"("syncConflict");

-- CreateIndex
CREATE INDEX "SalesOrder_pendingZohoFetch_idx" ON "SalesOrder"("pendingZohoFetch");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_zohoId_key" ON "Quote"("zohoId");

-- CreateIndex
CREATE INDEX "Quote_pendingCostSync_idx" ON "Quote"("pendingCostSync");

-- CreateIndex
CREATE INDEX "Quote_dealId_idx" ON "Quote"("dealId");

-- CreateIndex
CREATE INDEX "Quote_accountId_idx" ON "Quote"("accountId");

-- CreateIndex
CREATE INDEX "Quote_createdAt_idx" ON "Quote"("createdAt");

-- CreateIndex
CREATE INDEX "Quote_status_createdAt_idx" ON "Quote"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Quote_syncConflict_idx" ON "Quote"("syncConflict");

-- CreateIndex
CREATE INDEX "Quote_pendingZohoFetch_idx" ON "Quote"("pendingZohoFetch");

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_zohoId_key" ON "Invoice"("zohoId");

-- CreateIndex
CREATE INDEX "Invoice_accountId_idx" ON "Invoice"("accountId");

-- CreateIndex
CREATE INDEX "Invoice_dealId_idx" ON "Invoice"("dealId");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE INDEX "Invoice_issueDate_idx" ON "Invoice"("issueDate");

-- CreateIndex
CREATE INDEX "Invoice_status_issueDate_idx" ON "Invoice"("status", "issueDate");

-- CreateIndex
CREATE INDEX "Invoice_pendingCostSync_idx" ON "Invoice"("pendingCostSync");

-- CreateIndex
CREATE INDEX "Invoice_accountId_issueDate_status_idx" ON "Invoice"("accountId", "issueDate", "status");

-- CreateIndex
CREATE INDEX "Invoice_syncConflict_idx" ON "Invoice"("syncConflict");

-- CreateIndex
CREATE INDEX "Invoice_pendingZohoFetch_idx" ON "Invoice"("pendingZohoFetch");

-- CreateIndex
CREATE INDEX "Invoice_lastSyncedAt_idx" ON "Invoice"("lastSyncedAt");

-- CreateIndex
CREATE INDEX "Invoice_issueDate_status_accountId_idx" ON "Invoice"("issueDate", "status", "accountId");

-- CreateIndex
CREATE INDEX "Invoice_dueDate_status_idx" ON "Invoice"("dueDate", "status");

-- CreateIndex
CREATE INDEX "Invoice_salesOrderZohoId_idx" ON "Invoice"("salesOrderZohoId");

-- CreateIndex
CREATE INDEX "Invoice_estimateZohoId_idx" ON "Invoice"("estimateZohoId");

-- CreateIndex
CREATE INDEX "Note_accountId_idx" ON "Note"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "Task_zohoId_key" ON "Task"("zohoId");

-- CreateIndex
CREATE INDEX "Task_ownerId_idx" ON "Task"("ownerId");

-- CreateIndex
CREATE INDEX "Task_status_idx" ON "Task"("status");

-- CreateIndex
CREATE INDEX "Task_accountId_idx" ON "Task"("accountId");

-- CreateIndex
CREATE INDEX "Task_ownerId_status_dueDate_idx" ON "Task"("ownerId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "CustomFieldMapping_entity_idx" ON "CustomFieldMapping"("entity");

-- CreateIndex
CREATE INDEX "CustomFieldMapping_internalKey_idx" ON "CustomFieldMapping"("internalKey");

-- CreateIndex
CREATE UNIQUE INDEX "CustomFieldMapping_entity_apiName_key" ON "CustomFieldMapping"("entity", "apiName");

-- CreateIndex
CREATE INDEX "Payout_repId_idx" ON "Payout"("repId");

-- CreateIndex
CREATE INDEX "MonthlyVigGoal_repId_idx" ON "MonthlyVigGoal"("repId");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyVigGoal_repId_monthKey_key" ON "MonthlyVigGoal"("repId", "monthKey");

-- CreateIndex
CREATE INDEX "TimeEntry_userId_idx" ON "TimeEntry"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TimeEntry_userId_date_key" ON "TimeEntry"("userId", "date");

-- CreateIndex
CREATE INDEX "TimeChangeRequest_timeEntryId_idx" ON "TimeChangeRequest"("timeEntryId");

-- CreateIndex
CREATE INDEX "TimeChangeRequest_userId_idx" ON "TimeChangeRequest"("userId");

-- CreateIndex
CREATE INDEX "CampaignBlast_authorId_idx" ON "CampaignBlast"("authorId");

-- CreateIndex
CREATE INDEX "CampaignJob_authorId_idx" ON "CampaignJob"("authorId");

-- CreateIndex
CREATE INDEX "CampaignJob_status_idx" ON "CampaignJob"("status");

-- CreateIndex
CREATE INDEX "CampaignLog_campaignBlastId_idx" ON "CampaignLog"("campaignBlastId");

-- CreateIndex
CREATE INDEX "CampaignLog_accountId_idx" ON "CampaignLog"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "SmsMessage_zohoLogId_key" ON "SmsMessage"("zohoLogId");

-- CreateIndex
CREATE INDEX "SmsMessage_accountId_idx" ON "SmsMessage"("accountId");

-- CreateIndex
CREATE INDEX "SmsMessage_contactId_idx" ON "SmsMessage"("contactId");

-- CreateIndex
CREATE INDEX "SmsMessage_campaignBlastId_idx" ON "SmsMessage"("campaignBlastId");

-- CreateIndex
CREATE INDEX "SmsMessage_authorId_idx" ON "SmsMessage"("authorId");

-- CreateIndex
CREATE INDEX "SmsMessage_createdAt_idx" ON "SmsMessage"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CallLog_zohoCallId_key" ON "CallLog"("zohoCallId");

-- CreateIndex
CREATE INDEX "CallLog_accountId_idx" ON "CallLog"("accountId");

-- CreateIndex
CREATE INDEX "CallLog_contactId_idx" ON "CallLog"("contactId");

-- CreateIndex
CREATE INDEX "CallLog_authorId_idx" ON "CallLog"("authorId");

-- CreateIndex
CREATE INDEX "CallLog_createdAt_idx" ON "CallLog"("createdAt");

-- CreateIndex
CREATE INDEX "CallLog_accountId_createdAt_idx" ON "CallLog"("accountId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Notification_read_idx" ON "Notification"("read");

-- CreateIndex
CREATE INDEX "Advance_userId_idx" ON "Advance"("userId");

-- CreateIndex
CREATE INDEX "Reimbursement_userId_idx" ON "Reimbursement"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_zohoId_key" ON "PurchaseOrder"("zohoId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_invoiceId_idx" ON "PurchaseOrder"("invoiceId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_referenceNumber_idx" ON "PurchaseOrder"("referenceNumber");

-- CreateIndex
CREATE INDEX "PurchaseOrder_shipToName_idx" ON "PurchaseOrder"("shipToName");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_zohoId_key" ON "Payment"("zohoId");

-- CreateIndex
CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");

-- CreateIndex
CREATE INDEX "Payment_invoiceDbId_idx" ON "Payment"("invoiceDbId");

-- CreateIndex
CREATE INDEX "Payment_date_idx" ON "Payment"("date");

-- CreateIndex
CREATE UNIQUE INDEX "Package_zohoId_key" ON "Package"("zohoId");

-- CreateIndex
CREATE INDEX "Package_salesOrderId_idx" ON "Package"("salesOrderId");

-- CreateIndex
CREATE INDEX "Package_salesOrderNumber_idx" ON "Package"("salesOrderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_zohoId_key" ON "Vendor"("zohoId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesStage_slug_key" ON "SalesStage"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_zohoId_key" ON "Lead"("zohoId");

-- CreateIndex
CREATE INDEX "Lead_ownerId_idx" ON "Lead"("ownerId");

-- CreateIndex
CREATE INDEX "Lead_status_idx" ON "Lead"("status");

-- CreateIndex
CREATE INDEX "Lead_matchStatus_idx" ON "Lead"("matchStatus");

-- CreateIndex
CREATE INDEX "Lead_claimedById_idx" ON "Lead"("claimedById");

-- CreateIndex
CREATE INDEX "Lead_companyGroupId_idx" ON "Lead"("companyGroupId");

-- CreateIndex
CREATE INDEX "Lead_disposition_idx" ON "Lead"("disposition");

-- CreateIndex
CREATE INDEX "ScheduledMessage_status_idx" ON "ScheduledMessage"("status");

-- CreateIndex
CREATE INDEX "ScheduledMessage_scheduledTime_idx" ON "ScheduledMessage"("scheduledTime");

-- CreateIndex
CREATE INDEX "ScheduledMessage_accountId_idx" ON "ScheduledMessage"("accountId");

-- CreateIndex
CREATE INDEX "PerformanceGoalBonus_scope_idx" ON "PerformanceGoalBonus"("scope");

-- CreateIndex
CREATE INDEX "PerformanceGoalBonus_repId_idx" ON "PerformanceGoalBonus"("repId");

-- CreateIndex
CREATE INDEX "PerformanceGoalBonus_cadence_idx" ON "PerformanceGoalBonus"("cadence");

-- CreateIndex
CREATE INDEX "PerformanceGoalBonus_isActive_idx" ON "PerformanceGoalBonus"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "LineItem_zohoLineItemId_key" ON "LineItem"("zohoLineItemId");

-- CreateIndex
CREATE INDEX "LineItem_invoiceId_idx" ON "LineItem"("invoiceId");

-- CreateIndex
CREATE INDEX "LineItem_salesOrderId_idx" ON "LineItem"("salesOrderId");

-- CreateIndex
CREATE INDEX "LineItem_quoteId_idx" ON "LineItem"("quoteId");

-- CreateIndex
CREATE INDEX "LineItem_sku_idx" ON "LineItem"("sku");

-- CreateIndex
CREATE INDEX "ClawbackTransaction_repId_idx" ON "ClawbackTransaction"("repId");

-- CreateIndex
CREATE INDEX "ClawbackTransaction_invoiceId_idx" ON "ClawbackTransaction"("invoiceId");

-- CreateIndex
CREATE INDEX "ClawbackTransaction_monthKey_idx" ON "ClawbackTransaction"("monthKey");

-- CreateIndex
CREATE INDEX "ClawbackTransaction_status_idx" ON "ClawbackTransaction"("status");

-- CreateIndex
CREATE INDEX "CompensationPlan_repId_idx" ON "CompensationPlan"("repId");

-- CreateIndex
CREATE INDEX "CompensationPlan_status_idx" ON "CompensationPlan"("status");

-- CreateIndex
CREATE INDEX "BasePayEarning_repId_idx" ON "BasePayEarning"("repId");

-- CreateIndex
CREATE INDEX "BasePayEarning_planId_idx" ON "BasePayEarning"("planId");

-- CreateIndex
CREATE INDEX "AdvanceExtensionRequest_advanceId_idx" ON "AdvanceExtensionRequest"("advanceId");

-- CreateIndex
CREATE INDEX "AiChatLog_userId_idx" ON "AiChatLog"("userId");

-- CreateIndex
CREATE INDEX "AiChatLog_createdAt_idx" ON "AiChatLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DealAutomationState_dealId_key" ON "DealAutomationState"("dealId");

-- CreateIndex
CREATE INDEX "DealAutomationState_status_idx" ON "DealAutomationState"("status");

-- CreateIndex
CREATE INDEX "DealAutomationState_nextExecuteAt_idx" ON "DealAutomationState"("nextExecuteAt");

-- CreateIndex
CREATE INDEX "DealAutomationState_salesStageId_idx" ON "DealAutomationState"("salesStageId");

-- CreateIndex
CREATE UNIQUE INDEX "Email_zohoMailId_key" ON "Email"("zohoMailId");

-- CreateIndex
CREATE INDEX "Email_accountId_idx" ON "Email"("accountId");

-- CreateIndex
CREATE INDEX "Email_userId_idx" ON "Email"("userId");

-- CreateIndex
CREATE INDEX "Email_needsResponse_idx" ON "Email"("needsResponse");

-- CreateIndex
CREATE INDEX "Email_status_idx" ON "Email"("status");

-- CreateIndex
CREATE INDEX "Email_threadId_idx" ON "Email"("threadId");

-- CreateIndex
CREATE INDEX "EmailTemplate_category_idx" ON "EmailTemplate"("category");

-- CreateIndex
CREATE INDEX "EmailTemplate_isActive_idx" ON "EmailTemplate"("isActive");

-- CreateIndex
CREATE INDEX "AcceptedResponse_category_idx" ON "AcceptedResponse"("category");

-- CreateIndex
CREATE INDEX "AcceptedResponse_useCount_idx" ON "AcceptedResponse"("useCount");

-- CreateIndex
CREATE INDEX "MagicLinkToken_contact_code_idx" ON "MagicLinkToken"("contact", "code");

-- CreateIndex
CREATE INDEX "MagicLinkToken_expiresAt_idx" ON "MagicLinkToken"("expiresAt");

-- CreateIndex
CREATE INDEX "AutoshipSubscription_accountId_idx" ON "AutoshipSubscription"("accountId");

-- CreateIndex
CREATE INDEX "AutoshipSubscription_status_nextShipDate_idx" ON "AutoshipSubscription"("status", "nextShipDate");

-- CreateIndex
CREATE UNIQUE INDEX "AiCustomTool_name_key" ON "AiCustomTool"("name");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_repId_fkey" FOREIGN KEY ("repId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyVigGoal" ADD CONSTRAINT "MonthlyVigGoal_repId_fkey" FOREIGN KEY ("repId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeChangeRequest" ADD CONSTRAINT "TimeChangeRequest_timeEntryId_fkey" FOREIGN KEY ("timeEntryId") REFERENCES "TimeEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeChangeRequest" ADD CONSTRAINT "TimeChangeRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignBlast" ADD CONSTRAINT "CampaignBlast_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignJob" ADD CONSTRAINT "CampaignJob_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignLog" ADD CONSTRAINT "CampaignLog_campaignBlastId_fkey" FOREIGN KEY ("campaignBlastId") REFERENCES "CampaignBlast"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignLog" ADD CONSTRAINT "CampaignLog_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_campaignBlastId_fkey" FOREIGN KEY ("campaignBlastId") REFERENCES "CampaignBlast"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Advance" ADD CONSTRAINT "Advance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reimbursement" ADD CONSTRAINT "Reimbursement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceDbId_fkey" FOREIGN KEY ("invoiceDbId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_claimedById_fkey" FOREIGN KEY ("claimedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledMessage" ADD CONSTRAINT "ScheduledMessage_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledMessage" ADD CONSTRAINT "ScheduledMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledMessage" ADD CONSTRAINT "ScheduledMessage_campaignBlastId_fkey" FOREIGN KEY ("campaignBlastId") REFERENCES "CampaignBlast"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineItem" ADD CONSTRAINT "LineItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineItem" ADD CONSTRAINT "LineItem_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineItem" ADD CONSTRAINT "LineItem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClawbackTransaction" ADD CONSTRAINT "ClawbackTransaction_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClawbackTransaction" ADD CONSTRAINT "ClawbackTransaction_repId_fkey" FOREIGN KEY ("repId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompensationPlan" ADD CONSTRAINT "CompensationPlan_repId_fkey" FOREIGN KEY ("repId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BasePayEarning" ADD CONSTRAINT "BasePayEarning_repId_fkey" FOREIGN KEY ("repId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BasePayEarning" ADD CONSTRAINT "BasePayEarning_planId_fkey" FOREIGN KEY ("planId") REFERENCES "CompensationPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvanceExtensionRequest" ADD CONSTRAINT "AdvanceExtensionRequest_advanceId_fkey" FOREIGN KEY ("advanceId") REFERENCES "Advance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoshipSubscription" ADD CONSTRAINT "AutoshipSubscription_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoshipSubscription" ADD CONSTRAINT "AutoshipSubscription_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "AutoshipBundle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
