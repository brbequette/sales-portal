import handler from "../../../../netlify/functions/generate-campaign-ai";
import { NextRequest } from "next/server";

// The Netlify function is now a v2 handler: (req: Request, context) => Response.
// Forward the incoming request straight through and return its Response.
async function executeNetlifyFunction(req: NextRequest) {
  try {
    return await handler(req as unknown as Request, {} as any);
  } catch (error: any) {
    console.error('Error executing generate-campaign-ai:', error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) { return executeNetlifyFunction(req); }
export async function POST(req: NextRequest) { return executeNetlifyFunction(req); }
export async function PUT(req: NextRequest) { return executeNetlifyFunction(req); }
export async function DELETE(req: NextRequest) { return executeNetlifyFunction(req); }
export async function OPTIONS(req: NextRequest) { return executeNetlifyFunction(req); }
