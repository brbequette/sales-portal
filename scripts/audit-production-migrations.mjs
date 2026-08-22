import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
try {
  const ledger = await prisma.$queryRawUnsafe(`
    SELECT migration_name, finished_at IS NOT NULL AS finished,
           rolled_back_at IS NOT NULL AS rolled_back
    FROM _prisma_migrations ORDER BY started_at
  `).catch(() => []);
  const objects = await prisma.$queryRawUnsafe(`
    SELECT kind, name, present FROM (
      SELECT 'table' AS kind, name,
             to_regclass('public."' || name || '"') IS NOT NULL AS present
      FROM (VALUES ('SalesClosingChecklist'), ('PromotionDraft')) AS t(name)
      UNION ALL
      SELECT 'index', name, to_regclass('public."' || name || '"') IS NOT NULL
      FROM (VALUES
        ('Contact_accountId_isPrimary_idx'), ('Invoice_invoiceNumber_idx'),
        ('Invoice_salesorderNumber_idx'), ('Product_productType_idx'),
        ('Product_toolType_idx'), ('Product_equipment_idx')
      ) AS i(name)
      UNION ALL
      SELECT 'column', name, EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'Product' AND column_name = name
      )
      FROM (VALUES
        ('productType'), ('toolType'), ('equipment'), ('materials'), ('attributes'),
        ('imageUrl'), ('barcode'), ('weightGrams'), ('source')
      ) AS c(name)
    ) checks ORDER BY kind, name
  `);
  console.log(JSON.stringify({ ledger, objects }, null, 2));
} finally {
  await prisma.$disconnect();
}
