ALTER TABLE "Product"
  ADD COLUMN "productType" TEXT,
  ADD COLUMN "toolType" TEXT,
  ADD COLUMN "equipment" TEXT,
  ADD COLUMN "materials" JSONB,
  ADD COLUMN "attributes" JSONB,
  ADD COLUMN "imageUrl" TEXT,
  ADD COLUMN "barcode" TEXT,
  ADD COLUMN "weightGrams" DOUBLE PRECISION,
  ADD COLUMN "source" TEXT;

CREATE INDEX "Product_productType_idx" ON "Product"("productType");
CREATE INDEX "Product_toolType_idx" ON "Product"("toolType");
CREATE INDEX "Product_equipment_idx" ON "Product"("equipment");
