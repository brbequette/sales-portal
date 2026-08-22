import { handler } from "../../../../netlify/functions/get-media-assets";
import type { NextRequest } from "next/server";
import { executeSessionScopedNetlifyHandler } from "@/lib/netlify-route-adapter";

export async function GET(req: NextRequest) {
  return executeSessionScopedNetlifyHandler(req, handler);
}
