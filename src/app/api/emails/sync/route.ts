import handler from "../../../../../netlify/functions/email-sync";
import { NextRequest, NextResponse } from "next/server";

// The Netlify function is now a v2 handler: (req: Request, context) => Response.
// Forward the incoming request straight through and return its Response.
async function executeNetlifyFunction(req: NextRequest) {
  try {
    return await handler(req as unknown as Request, {} as any);
  } catch (error: any) {
    console.error('Error executing email sync:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await require("next-auth").getServerSession(require("@/lib/auth").authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return executeNetlifyFunction(req);
}
export async function OPTIONS(req: NextRequest) { return executeNetlifyFunction(req); }
