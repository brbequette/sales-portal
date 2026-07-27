const fs = require('fs');

const funcs = fs.readdirSync('./netlify/functions')
  .filter(f => f.endsWith('.ts'))
  .map(f => f.replace('.ts', ''));

let redirectsToml = `[build]
  command = "npm run build"
  publish = ".next"

[build.environment]
  NODE_VERSION = "20.18.0"

[functions]
  directory = "netlify/functions"
  node_bundler = "esbuild"

[[headers]]
  for = "/api/*"
  [headers.values]
    Access-Control-Allow-Origin = "*"
    Access-Control-Allow-Methods = "GET, POST, PUT, DELETE, OPTIONS"
    Access-Control-Allow-Headers = "Content-Type, Authorization"

`;

// Map hyphens to slashes where appropriate (e.g. admin-users -> /api/admin/users to /.netlify/functions/admin-users)
funcs.forEach(func => {
  let apiPath = `/api/${func}`;
  if (func.startsWith('admin-')) {
    apiPath = `/api/admin/${func.replace('admin-', '')}`;
  } else if (func.startsWith('timeclock-')) {
    apiPath = `/api/timeclock/${func.replace('timeclock-', '')}`;
  }
  redirectsToml += `[[redirects]]
  from = "${apiPath}"
  to = "/.netlify/functions/${func}"
  status = 200

`;
});

// Also add account alias
redirectsToml += `[[redirects]]
  from = "/account/:id"
  to = "/account?id=:id"
  status = 200
`;

fs.writeFileSync('./netlify.toml', redirectsToml, 'utf8');
console.log('Successfully generated netlify.toml with corrected slash-to-hyphen function mappings!');
