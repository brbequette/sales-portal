import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const wrapper = await fs.readFile(new URL('../run-production-reconciliation.ps1', import.meta.url), 'utf8');
assert.match(wrapper, /-v.*\$\{repo\}\/netlify\/functions\/lib:\/netlify\/functions\/lib:ro/);
assert.match(wrapper, /-v.*\$\{repo\}:\/workspace:ro/);

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'provider-layout-'));
try {
  await fs.mkdir(path.join(root, 'work'), { recursive: true });
  await fs.mkdir(path.join(root, 'netlify', 'functions', 'lib'), { recursive: true });
  await fs.copyFile(new URL('../reconciliation-zoho-client.mjs', import.meta.url), path.join(root, 'work', 'reconciliation-zoho-client.mjs'));
  await fs.copyFile(new URL('../../../netlify/functions/lib/zoho-token-provider.mjs', import.meta.url), path.join(root, 'netlify', 'functions', 'lib', 'zoho-token-provider.mjs'));
  await fs.chmod(path.join(root, 'netlify', 'functions', 'lib', 'zoho-token-provider.mjs'), 0o444);
  assert.ok((await fs.stat(path.join(root, 'netlify', 'functions', 'lib', 'zoho-token-provider.mjs'))).isFile());
  assert.equal((await fs.stat(path.join(root, 'netlify', 'functions', 'lib', 'zoho-token-provider.mjs'))).mode & 0o222, 0, 'provider mount must be read-only');
  const client = await import('../reconciliation-zoho-client.mjs');
  assert.equal(typeof client.createZohoBooksClient, 'function');
  assert.equal(typeof client.endpointFor, 'function');
  console.log('PROVIDER_CONTAINER_LAYOUT=PASS');
  console.log('SHARED_PROVIDER_PACKAGING=PASS');
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
