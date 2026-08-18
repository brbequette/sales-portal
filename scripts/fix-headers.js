const fs = require('fs');
const file = 'netlify/functions/manage-media-asset.ts';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(/headers:\s*\{\s*"Content-Type":\s*"application\/json",\s*"Access-Control-Allow-Origin":\s*"\*"\s*\}/g, 'headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } as Record<string, string>');
fs.writeFileSync(file, content);
