const fs = require('fs');
const path = require('path');
const srcDir = path.join(__dirname, '..', 'src');
const replacements = [
  // Arrows
  [/→/g, ' to '],
  [/←/g, ' from '],
  [/↑/g, ' up '],
  [/↓/g, ' down '],
  [/↗/g, ' up '],
  [/↙/g, ' down '],
  [/⇒/g, '=>'],
  [/⇐/g, '<='],
  // Box drawing / decorative
  [/─/g, '-'],
  [/│/g, '|'],
  [/═/g, '='],
  // Symbols that typically show as boxes
  [/•/g, '-'],
  [/·/g, '.'],
  // Smart quotes (render as â€œ etc)
  [/\u201C/g, '"'],
  [/\u201D/g, '"'],
  [/\u2018/g, "'"],
  [/\u2019/g, "'"],
  [/\u2013/g, '-'],  // en dash
  [/\u2014/g, '--'], // em dash
  [/\u2026/g, '...'], // ellipsis
  [/\u00A0/g, ' '],   // non-breaking space
  [/\u2122/g, '(TM)'], // trademark
  [/\u00AE/g, '(R)'],  // registered
  [/\u00A9/g, '(C)'],  // copyright
];

// Emoji that are safe to keep in JSX (React renders them fine if file is proper UTF-8)
// But listing them helps diagnose
const SAFE_EMOJI_PATTERN = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;

function walkDir(dir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', '.next', '.git'].includes(entry.name)) walkDir(full, results);
    } else if (entry.isFile() && (full.endsWith('.tsx') || full.endsWith('.ts'))) {
      results.push(full);
    }
  }
  return results;
}

const files = walkDir(srcDir);
const changed = [];
const withEmoji = [];

for (const f of files) {
  let content = fs.readFileSync(f, 'utf8');
  let original = content;
  
  for (const [pattern, replacement] of replacements) {
    content = content.replace(pattern, replacement);
  }
  
  if (content !== original) {
    fs.writeFileSync(f, content, 'utf8');
    changed.push(f.replace(srcDir, ''));
    console.log(`FIXED: ${f.replace(srcDir, '')}`);
  }

  // Report files with emoji (for awareness)
  const emojiMatches = [...content.matchAll(SAFE_EMOJI_PATTERN)];
  if (emojiMatches.length > 0) {
    withEmoji.push(`${f.replace(srcDir, '')} (${emojiMatches.length} emoji)`);
  }
}

console.log(`\n=== CHANGED: ${changed.length} files ===`);
console.log(`=== WITH EMOJI (may need jsx conversion): ${withEmoji.length} files ===`);
withEmoji.slice(0, 20).forEach(l => console.log(' -', l));
