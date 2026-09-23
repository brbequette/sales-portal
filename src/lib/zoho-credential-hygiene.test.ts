import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const files = [
  'backfill_po_invoice_links.js',
  'exchange-token.js',
  'fetch-accounts.js',
  'find-vig-field.js',
  'find-vig-so.js',
];

describe('Zoho credential hygiene', () => {
  it.each(files)('contains no embedded Zoho OAuth credential: %s', (file) => {
    const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
    expect(source).not.toMatch(/1000\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/);
    expect(source).not.toMatch(/["'][a-f0-9]{40,}["']/i);
  });
});
