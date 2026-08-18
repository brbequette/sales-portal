const fs = require('fs');
const path = require('path');

const netlifyFuncs = fs.readdirSync('./netlify/functions')
  .filter(f => f.endsWith('.ts'))
  .map(f => f.replace('.ts', ''));

function getRoutes(dir, base = '') {
  let routes = [];
  fs.readdirSync(dir).forEach(f => {
    const full = path.join(dir, f);
    const rel = path.join(base, f);
    if (fs.statSync(full).isDirectory()) {
      routes = routes.concat(getRoutes(full, rel));
    } else if (f === 'route.ts') {
      routes.push(base.replace(/\\/g, '/'));
    }
  });
  return routes;
}

const apiRoutes = getRoutes('./src/app/api');

console.log('API routes count:', apiRoutes.length);
console.log('Netlify functions count:', netlifyFuncs.length);

const missingInNetlify = apiRoutes.filter(r => {
  // e.g. "shipping" -> check if "shipping" or "shipping.ts" exists
  const funcName = r.split('/')[0];
  return !netlifyFuncs.includes(funcName) && !netlifyFuncs.includes(r);
});

console.log('\nAPI routes that do NOT have a Netlify function in netlify/functions:');
console.log(missingInNetlify);
