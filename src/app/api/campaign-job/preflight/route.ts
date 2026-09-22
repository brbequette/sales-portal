/* eslint-disable @typescript-eslint/no-explicit-any */
import { handler } from "../../../../../netlify/functions/campaign-job-preflight"
export async function POST(request: Request) { const response = await handler({ httpMethod: "POST", headers: Object.fromEntries(request.headers), body: await request.text() } as any, {} as any); return new Response(response?.body, { status: response?.statusCode || 500, headers: response?.headers as HeadersInit }) }
