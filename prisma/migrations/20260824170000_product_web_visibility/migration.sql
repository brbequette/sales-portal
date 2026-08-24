ALTER TABLE "Product"
ADD COLUMN "showOnWeb" BOOLEAN NOT NULL DEFAULT true;

UPDATE "Product"
SET "showOnWeb" = false WHERE "giftItem" = true;
