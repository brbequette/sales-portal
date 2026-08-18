const { Client } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;

async function setupTable() {
  console.log('Connecting to database...');
  const client = new Client({ connectionString });
  try {
    await client.connect();
    console.log('Connected successfully!');
    await client.query(`
      CREATE TABLE IF NOT EXISTS "CustomFieldMapping" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "entity" TEXT NOT NULL,
        "label" TEXT NOT NULL,
        "apiName" TEXT NOT NULL,
        "customfieldId" TEXT,
        "internalKey" TEXT NOT NULL,
        "dataType" TEXT NOT NULL DEFAULT 'string',
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "description" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "CustomFieldMapping_entity_apiName_key" ON "CustomFieldMapping"("entity", "apiName");
      CREATE INDEX IF NOT EXISTS "CustomFieldMapping_entity_idx" ON "CustomFieldMapping"("entity");
      CREATE INDEX IF NOT EXISTS "CustomFieldMapping_internalKey_idx" ON "CustomFieldMapping"("internalKey");
    `);
    console.log('CustomFieldMapping table created/verified successfully!');
  } catch (err) {
    console.error('Error creating table:', err);
  } finally {
    await client.end();
  }
}

setupTable();
