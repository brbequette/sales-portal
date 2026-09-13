import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const root = process.env.RECONCILIATION_INPUTS || path.resolve('tmp/Titan_Zoho_Reconciliation_Inputs_2026-09-08');
async function run(){const outputs=[];for(let i=0;i<2;i++){const out=await fs.mkdtemp(path.join(os.tmpdir(),'reconciliation-zip-'));process.env.RECONCILIATION_INPUTS=root;process.env.RECONCILIATION_OUTPUT=out;const {parseSources}=await import('../reconciliation-engine.mjs?run='+i);const result=await parseSources();assert.ok(result.docs.length>0);outputs.push(result.docs.length)}assert.deepEqual(outputs,[16130,16130]);console.log('ZIP_REGRESSION_TEST=PASS')}
await run();
