const fs = require('fs');
const path = require('path');

const functionsDir = path.join(process.cwd(), 'netlify/functions');
const apiDir = path.join(process.cwd(), 'src/app/api');

const files = fs.readdirSync(functionsDir);
let count = 0;
for (const file of files) {
  if (!file.endsWith('.ts')) continue;
  const name = file.replace('.ts', '');
  if (name === 'zoho-oauth' || name === 'auth-login' || name === 'lib') continue;
  
  const routeDir = path.join(apiDir, name);
  fs.mkdirSync(routeDir, { recursive: true });
  
  const routeFile = path.join(routeDir, 'route.ts');
  const code = `import { handler } from "../../../../netlify/functions/${name}";
import { NextRequest, NextResponse } from "next/server";

async function executeNetlifyFunction(req: NextRequest) {
  const url = new URL(req.url);
  const event = {
    path: url.pathname,
    httpMethod: req.method,
    headers: Object.fromEntries(req.headers.entries()),
    queryStringParameters: Object.fromEntries(url.searchParams.entries()),
    body: req.method !== 'GET' && req.method !== 'HEAD' ? await req.text() : null,
    isBase64Encoded: false,
  };

  const context = {};

  try {
    const result: any = await handler(event as any, context as any);
    if (!result) return new NextResponse('', { status: 200 });
    
    if (result.statusCode === 302 || result.statusCode === 301) {
      const location = result.headers?.Location || result.headers?.location;
      if (location) return NextResponse.redirect(location);
    }
    return new NextResponse(result.body || '', {
      status: result.statusCode || 200,
      headers: result.headers || { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error executing ${name}:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) { return executeNetlifyFunction(req); }
export async function POST(req: NextRequest) { return executeNetlifyFunction(req); }
export async function PUT(req: NextRequest) { return executeNetlifyFunction(req); }
export async function DELETE(req: NextRequest) { return executeNetlifyFunction(req); }
export async function OPTIONS(req: NextRequest) { return executeNetlifyFunction(req); }
`;
  fs.writeFileSync(routeFile, code);
  count++;
}
console.log('Migrated ' + count + ' functions.');
