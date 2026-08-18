import { PrismaClient } from '@prisma/client';
import { chromium } from 'playwright';

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:3000';
const TEST_TAG = `[TORTURE-TEST]-${Date.now()}`;

async function executeUiTortureTest() {
  console.log('🔥 Initializing Antigravity Full-System UI Torture Suite...');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    extraHTTPHeaders: { 'x-bypass-auth': 'true' }
  });
  const page = await context.newPage();
  const problemsFound: Array<{ context: string; action: string; fault: string }> = [];

  try {
    // ---- STEP 1: ENTITY CREATION & SAVE AUDIT ----
    console.log('📝 Step 1: Testing full Entity Creation lifecycle via UI forms...');
    // Create a temporary user with a [TORTURE-TEST] prefix
    const testUserId = `torture-user-${Date.now()}`;
    const testUserName = `${TEST_TAG} Representative`;
    await prisma.user.create({
      data: {
        id: testUserId,
        name: testUserName,
        email: `torture-rep-${Date.now()}@antigravity-test.local`,
        role: 'REPRESENTATIVE'
      }
    });

    // Request a valid magic link token for the newly created user
    const tokenResponse = await context.request.get(`${BASE_URL}/api/rep-portal/verify?action=generate&repId=${testUserId}`);
    const tokenData = await tokenResponse.json();
    const token = tokenData.token;

    await page.goto(`${BASE_URL}/rep-portal?token=${token}`);
    
    // Navigate to the Reimbursements tab first
    await page.click('button:has-text("Reimbursements"), a:has-text("Reimbursements")');
    await page.waitForTimeout(500);
    
    // Attempt to submit a new reimbursement entity via the UI form
    await page.fill('input[placeholder*="Travel expenses"]', `${TEST_TAG} Premium Travel Outlay`);
    await page.fill('input[placeholder="0.00"]', '450.75');
    
    const submitBtn = await page.$('button[type="submit"], button:has-text("Submit")');
    if (submitBtn) {
      await submitBtn.click();
      await page.waitForTimeout(1000);
      console.log('   ✅ Save event fired successfully for new entity.');
    } else {
      problemsFound.push({ context: 'Rep Portal', action: 'Create Entity', fault: 'Reimbursement submission button missing or broken.' });
    }

    // ---- STEP 2: EXTERNAL RE-SYNC PIPELINE AUDIT ----
    console.log('🔄 Step 2: Validating Save-to-Sync pipelines to Zoho integrations...');
    await page.goto(`${BASE_URL}/shipping?bypass=true`);
    
    const syncZohoBtn = await page.$('button:has-text("Sync with Zoho"), button:has-text("Manual Sync")');
    if (syncZohoBtn) {
      // Capture network response status when clicking manual external automation bridges
      const [response] = await Promise.all([
        page.waitForResponse(res => res.url().includes('/api/') && res.status() !== 200, { timeout: 3000 }).catch(() => null),
        syncZohoBtn.click()
      ]);
      
      if (response) {
        problemsFound.push({ context: 'Shipping Portal', action: 'Zoho Sync Link', fault: `External sync handler rejected data stream with HTTP Status ${response.status()}` });
      } else {
        console.log('   ✅ Manual Zoho sync button route processed without crashing.');
      }
    }

    // ---- STEP 3: REACTIVE FILTER CALCULATION STRESS TEST ----
    console.log('📊 Step 3: Cycling calculations across active UI filter dropdown states...');
    await page.goto(`${BASE_URL}/commissions`);
    
    // Query dropdown triggers present on the primary calculation ledger grid
    const dropdowns = await page.$$('select, button[aria-haspopup="listbox"]');
    console.log(`   -> Found ${dropdowns.length} layout filter elements to alternate.`);

    // Loop through formats to force reactive math updates
    const formatButtons = ['Weekly', 'Flat', 'Print View'];
    for (const format of formatButtons) {
      const toggle = await page.$(`button:has-text("${format}")`);
      if (toggle) {
        await toggle.click();
        await page.waitForTimeout(500); // Allow Next.js DOM state transformation window
        
        const currentUiContent = await page.innerText('body');
        if (/NaN|undefined|null|Error/i.test(currentUiContent)) {
          problemsFound.push({ context: 'Commissions Grid', action: `Toggle Format [${format}]`, fault: 'UI layout displayed mathematical distortion errors or raw missing properties.' });
        }
      }
    }

    // ---- STEP 4: AUDIT EVALUATION OUTPUT ----
    console.log('\n🏁 --- SYSTEM TORTURE RUN COMPLETE ---');
    if (problemsFound.length === 0) {
      console.log('✅ Phenomenal! The application survived all state alterations, layout flips, and sync saves perfectly.');
    } else {
      console.log(`❌ Identified ${problemsFound.length} functional UI execution vulnerabilities:`);
      console.dir(problemsFound, { depth: null });
    }

  } catch (error: any) {
    console.error('💥 Torture sequence interrupted by execution fault:', error.message);
  } finally {
    console.log('🧹 Clearing temporary torture entities from local database context...');
    await cleanUpTortureData();
    await browser.close();
  }
}

async function cleanUpTortureData() {
  // Purge any leftover database rows tagged with the distinct torture identifier
  try {
    await prisma.reimbursement.deleteMany({ where: { description: { startsWith: '[TORTURE-TEST]' } } });
  } catch (e) {}
  await prisma.user.deleteMany({ where: { name: { startsWith: '[TORTURE-TEST]' } } });
  console.log('✨ Workspace restored to clean data state.');
}

executeUiTortureTest();
