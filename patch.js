const fs = require('fs');
let code = fs.readFileSync('src/components/DashboardView.tsx', 'utf8');

// We want to add role, tabIndex, and onKeyDown to div elements that have onClick.
// We can just find `<div ` and if it contains `onClick={`, we inject the a11y attributes.
// Actually, it's safer to just inject it right after `<div ` if the div has an onClick.

const lines = code.split('\n');
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('<div ') || (lines[i].includes('<div') && lines[i+1] && lines[i+1].includes('onClick'))) {
    // Look ahead a few lines to see if there's an onClick before the >
    let j = i;
    let hasOnClick = false;
    let endOfTag = -1;
    let tagString = '';
    while (j < lines.length && j < i + 10) {
      tagString += lines[j] + '\n';
      if (lines[j].includes('onClick=')) hasOnClick = true;
      if (lines[j].includes('>')) {
        endOfTag = j;
        break;
      }
      j++;
    }
    
    if (hasOnClick && endOfTag !== -1) {
      // It's a div with onClick. Let's add the attributes to the first line of the div.
      // E.g. `<div ` -> `<div role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click(); } }} `
      // BUT only if not already added
      if (!tagString.includes('role="button"')) {
        lines[i] = lines[i].replace(/<div\b/, '<div role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === \'Enter\' || e.key === \' \') { e.preventDefault(); e.currentTarget.click(); } }}');
      }
    }
  }
}

fs.writeFileSync('src/components/DashboardView.tsx', lines.join('\n'));
