import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const auth = fs.readFileSync(path.join(root, 'netlify/functions/lib/zoho-auth.ts'), 'utf8');
assert.doesNotMatch(auth, /zoho-token-provider/);
assert.match(auth, /export async function getZohoAccessToken\(forceRefresh = false\)/);
assert.match(auth, /ZOHO_DC = cleanEnv\(process\.env\.ZOHO_DC\) \|\| 'com'/);
const sql = fs.readFileSync(path.join(root, 'prisma/migrations/20260914160000_complete_schema_alignment/migration.sql'), 'utf8');
assert.match(sql, /ADD COLUMN IF NOT\s+EXISTS "conversationId" TEXT/);
for (const column of [
  'closingPrompt','department','discoveryPrompts','objectionResponses','objective','priority','scenario',
  'conversationId','emailMailboxId','preview','processedAt','processingError','rawMetadata',
  'evidence'
]) assert.match(sql, new RegExp(`ADD COLUMN IF NOT\\s+EXISTS "${column}"`));
assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS "CommunicationEvent"'));
assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS "EmailMailbox"'));
assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS "TaskOutcome"'));
for (const model of ['CommunicationEvent','SalesCommitment','AutomationRecommendation','EmailMailbox','EmailAttachment','EmailOperationalEvent','OperationalEvent','WorkAssignment','IntegrationSyncState','IntegrationException','TaskOutcome']) assert.ok(sql.includes(`CREATE TABLE IF NOT EXISTS "${model}"`));
assert.doesNotMatch(sql, /^DROP\s+(TABLE|COLUMN|INDEX)/im);
assert.doesNotMatch(sql, /^\s*(TRUNCATE|UPDATE)\b/im);
console.log('AUTH_KNOWN_GOOD_COMPATIBILITY=PASS');
console.log('DATABASE_RECOVERY_MIGRATION=PASS');
