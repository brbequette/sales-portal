import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();
const TARGET_PHONE = '618-335-5304';
const ZOHO_ORG_ID = '664670946';

// Read webhook secret from .env file
let webhookSecret = process.env.ZOHO_WEBHOOK_SECRET || "";
if (!webhookSecret) {
  try {
    const envContent = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf-8');
    const match = envContent.match(/ZOHO_WEBHOOK_SECRET\s*=\s*["']?([^"'\s]+)["']?/);
    if (match) {
      webhookSecret = match[1];
    }
  } catch (e) {}
}

async function runZohoVoiceBackendTrace() {
  console.log('========================================================================');
  console.log('🔍 DEEP BACKEND API LAYER: ZOHO VOICE & CRM COMMUNICATION TRACE');
  console.log('========================================================================');

  try {
    // 1. Pre-flight verification: Confirm account database metrics
    console.log('🧱 Querying production PostgreSQL for active system parameters...');
    const account = await prisma.account.findFirst({ where: { name: 'BEN TEST ACCOUNT' } });
    if (!account) {
      throw new Error("Safety Abort: Could not find 'BEN TEST ACCOUNT' profile in local database schema.");
    }
    console.log(`   ✅ Target reference verified. Account ID: ${account.id}`);

    // 2. Direct Network Ping to Zoho Communication Webhook Handler
    console.log('\n📞 Simulating live Zoho Voice call log entry hook dispatch...');
    const sampleZohoVoicePayload = {
      call_id: `test-call-id-${Date.now()}`,
      from_number: TARGET_PHONE,
      to_number: '618-335-5304',
      direction: 'INBOUND',
      duration: 75,
      status: 'COMPLETED',
      transcript: '[ANTIGRAVITY-CRITICAL] Deep server-level Zoho Voice integration validation trace.',
    };

    console.log('   -> Dispatching manual test payload directly into your Next.js route handler...');
    // Targets your local API routing endpoint responsible for intercepting Zoho events
    const response = await fetch(`http://localhost:3000/api/webhooks/zoho-voice?token=${webhookSecret}`, {
      method: 'POST',
      headers: { 
        'x-bypass-auth': 'true',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(sampleZohoVoicePayload)
    });

    console.log(`\n📊 API Route response received with HTTP Status: ${response.status}`);
    const data = await response.json();
    console.log('   -> Response Payload Shape:', data);

  } catch (error: any) {
    console.error('\n💥 CRITICAL ZOHO INTEGRATION ROUTING FAULT DETECTED:');
    console.error('   -> Error Message:', error.message || error);
  }
}

runZohoVoiceBackendTrace();
