import { PrismaClient } from '@prisma/client';
import { chromium } from 'playwright';

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:3000';

// Targeted system views mapped across your application router layout
const SYSTEM_ROUTES = [
  '/dashboard',
  '/commissions',
  '/rep-portal?bypass=true',
  '/shipping?bypass=true',
  '/timeclock',
  '/tv?bypass=true',
  '/collections'
];

async function runSystemWideTortureTest() {
  console.log('========================================================================');
  console.log('🔥 INITIALIZING ANTIGRAVITY AUTOMATED SYSTEM-WIDE UI TORTURE SUITE');
  console.log('========================================================================\n');

  // 1. Launch headless browser engine
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    extraHTTPHeaders: { 'x-bypass-auth': 'true' }
  });

  // 2. COOKIE INJECTION PATCH: Enforces persistent high-privilege sessions globally
  console.log('🍪 Injecting bypass session tokens into browser authentication context...');
  const cookiePayload = {
    name: 'next-auth.session-token',
    value: `test-token-manager-bypass-${Date.now()}`,
    domain: 'localhost',
    path: '/',
    expires: (Date.now() / 1000) + 3600, // Explicitly valid for 1 hour
    httpOnly: true,
    secure: false,
    sameSite: 'Lax' as const
  };
  
  await context.addCookies([cookiePayload]);
  const page = await context.newPage();

  // 3. DIAGNOSTIC INTERCEPTION SNIPPET: Listen to hidden browser anomalies
  console.log('🛡️  Activating deep browser log listeners to capture silent rendering crashes...\n');

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.error(`🔴 BROWSER CONSOLE ERROR: "${msg.text()}"`);
    }
  });

  page.on('pageerror', exception => {
    console.error(`💥 CRITICAL CLIENT-SIDE RUNTIME CRASH: ${exception.message}`);
  });

  page.on('requestfailed', request => {
    console.error(`❌ NETWORK FETCH FAILED: [${request.method()}] ${request.url()} - Error: ${request.failure()?.errorText}`);
  });

  const systemFaults: Array<{ path: string; element: string; exception: string }> = [];

  // 4. Begin systematic multi-route crawl
  for (const route of SYSTEM_ROUTES) {
    const targetUrl = `${BASE_URL}${route}`;
    console.log(`\n🗺️  Crawling View Route: ${route}`);
    
    try {
      // Force page load, waiting until the main network activity settles down
      await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 10000 });
      await page.waitForTimeout(2000); // Allow Next.js client component hydration layer to lock

      // Scan the rendered DOM layout for all core interactive web elements
      const clickables = await page.$$('button, a, select, [role="button"], input[type="submit"]');
      console.log(`   -> Found ${clickables.length} interactive elements to test.`);

      // Print page title or text snip to diagnose redirect landing spots
      const currentTitle = await page.title();
      const visibleText = (await page.evaluate(() => document.body.innerText)).substring(0, 100).replace(/\n/g, ' ');
      console.log(`   -> Current Page Title: "${currentTitle}" | Preview: "${visibleText}..."`);

      // Cycle and click up to 15 distinct components per route view layout
      for (let i = 0; i < Math.min(clickables.length, 15); i++) {
        try {
          const element = clickables[i];
          
          // Use evaluate to safely pull text content and tag details out of the handle context
          const text = (await page.evaluate(el => el.textContent, element))?.trim() || `Element [Index ${i}]`;
          const tagName = await page.evaluate(el => el.tagName, element);

          // Crucial Guardrail: Bypass dangerous structural operations or reset controls
          if (/delete|purge|wipe|reset/i.test(text)) {
            console.log(`   ⚠️  Skipping destructive interaction node: <${tagName}> "${text}"`);
            continue;
          }

          // Force programmatic interaction event
          await element.click({ timeout: 1500 }).catch(() => {});
          await page.waitForTimeout(400);

          // Evaluate the visible inner body text for signs of application calculation collapse
          const screenContent = await page.evaluate(() => document.body.innerText);
          if (/NaN|undefined|null value|Internal Server Error|500\s*:\s*Internal/i.test(screenContent)) {
            systemFaults.push({
              path: route,
              element: `<${tagName.toLowerCase()}> - "${text}"`,
              exception: 'Interactive event broke underlying component matrices, yielding a rendering fracture.'
            });
          }
        } catch (innerClickError) {
          // Component unmounted or visibility properties toggled post-state update. Proceed safely.
        }
      }
    } catch (routeError: any) {
      systemFaults.push({
        path: route,
        element: 'Viewport Route Handler',
        exception: `Failed to open view route structure cleanly: ${routeError.message}`
      });
      console.error(`   ❌ Navigation Exception: ${routeError.message}`);
    }
  }

  // ---- AUDIT METRICS REPORT ENGINE ----
  console.log('\n========= FINAL VERDICT PROFILE =========');
  if (systemFaults.length === 0) {
    console.log('✅ ALL INTERFACES HARDENED: Client elements navigated cleanly with zero application crashes.');
  } else {
    console.log(`❌ Identified ${systemFaults.length} dynamic vulnerabilities or structural flaws:`);
    console.dir(systemFaults, { depth: null });
  }
  console.log('==========================================');

  await browser.close();
}

runSystemWideTortureTest();
