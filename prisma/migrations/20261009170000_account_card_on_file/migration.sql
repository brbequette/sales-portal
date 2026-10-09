-- Staff-confirmed status only; never stores card credentials.
ALTER TABLE "Account" ADD COLUMN "cardOnFile" BOOLEAN;
