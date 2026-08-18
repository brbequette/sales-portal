const fs = require('fs');
const file = 'c:/Users/titan/Documents/Titan Diamond/AUTOMATIONS/sales-portal/src/app/globals.css';
let css = fs.readFileSync(file, 'utf8');

const responsiveTableCss = `
/* ── 19. RESPONSIVE TABLES ──────────────────────────────────── */
.td-responsive-table {
  width: 100%;
}
@media (max-width: 767px) {
  .td-responsive-table thead {
    display: none;
  }
  .td-responsive-table, .td-responsive-table tbody, .td-responsive-table tr, .td-responsive-table td {
    display: block;
    width: 100%;
  }
  .td-responsive-table tr {
    margin-bottom: 1rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface-2);
    padding: 0.5rem;
  }
  .td-responsive-table td {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--border);
    padding: 0.5rem;
    text-align: right;
  }
  .td-responsive-table td:last-child {
    border-bottom: none;
  }
  .td-responsive-table td::before {
    content: attr(data-label);
    font-weight: 600;
    font-size: 0.75rem;
    text-transform: uppercase;
    color: var(--muted-2);
    margin-right: 1rem;
    text-align: left;
  }
}
`;

let newCss = '';
const importMatch = css.match(/^@import [^;]+;\n+/);
if (importMatch) {
  newCss += importMatch[0];
  css = css.substring(importMatch[0].length);
}

const idxTokens = css.indexOf('/* ── 1. DESIGN TOKENS');
const idxSurface = css.indexOf('/* ── 3. SURFACE COMPONENTS');
const idxGradients = css.indexOf('/* ── 12. GRADIENTS & GLOW');

if (idxTokens === -1 || idxSurface === -1 || idxGradients === -1) {
    console.error("Could not find section markers.");
    process.exit(1);
}

// Ensure @theme inline stays outside of @layer base, because @theme isn't valid inside @layer in Tailwind v4.
// Let's look for @theme inline.
let basePart = css.substring(idxTokens, idxSurface);

// Better to just wrap everything as requested, or explicitly move @theme out.
// Wait, the prompt says "@layer base { } for resets and :root tokens".
// Let's just wrap it.

let componentsPart = css.substring(idxSurface, idxGradients);
let utilitiesPart = css.substring(idxGradients);

// Replace lines globally to indent
basePart = basePart.split('\n').map(line => '  ' + line).join('\n');
componentsPart = componentsPart.split('\n').map(line => '  ' + line).join('\n');
utilitiesPart = utilitiesPart.split('\n').map(line => '  ' + line).join('\n');
let resp = responsiveTableCss.split('\n').map(line => '  ' + line).join('\n');

newCss += '@layer base {\n' + basePart + '}\n\n';
newCss += '@layer components {\n' + componentsPart + '}\n\n';
newCss += '@layer utilities {\n' + utilitiesPart + '\n' + resp + '}\n';

fs.writeFileSync(file, newCss);
console.log('CSS updated successfully');
