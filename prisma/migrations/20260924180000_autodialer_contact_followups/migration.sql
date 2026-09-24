ALTER TABLE "ScheduledMessage" ADD COLUMN "contactId" TEXT;
CREATE INDEX "ScheduledMessage_contactId_idx" ON "ScheduledMessage"("contactId");
ALTER TABLE "ScheduledMessage" ADD CONSTRAINT "ScheduledMessage_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
