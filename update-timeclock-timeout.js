const fs = require('fs');

function updateFile(file, replacer) {
  let content = fs.readFileSync(file, 'utf8');
  content = replacer(content);
  fs.writeFileSync(file, content);
  console.log('Updated ' + file);
}

// 1. get-entries/route.ts
updateFile('src/app/api/timeclock/get-entries/route.ts', content => {
  return content.replace(/> 10 \* 60000/g, '> 20 * 60000')
                .replace(/\+ 10 \* 60000/g, '+ 20 * 60000');
});

// 2. admin/route.ts
updateFile('src/app/api/timeclock/admin/route.ts', content => {
  return content.replace(/> 10 \* 60000/g, '> 20 * 60000')
                .replace(/\+ 10 \* 60000/g, '+ 20 * 60000');
});

// 3. sync/route.ts
updateFile('src/app/api/timeclock/sync/route.ts', content => {
  return content.replace(/10 \* 60000/g, '20 * 60000')
                .replace(/30 \* 60000/g, '20 * 60000');
});

// 4. GlobalTopBar.tsx
updateFile('src/components/GlobalTopBar.tsx', content => {
  return content.replace(/> 10m/g, '> 20m');
});

// 5. trainingData.ts
updateFile('src/lib/trainingData.ts', content => {
  return content.replace(/\*\*10 minutes idle\*\*/g, '**20 minutes idle**');
});
