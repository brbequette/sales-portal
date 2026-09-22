import { handler } from "../../../../netlify/functions/get-rep-stats"
import { executeSessionScopedNetlifyHandler } from "@/lib/netlify-route-adapter"
import type { NextRequest } from "next/server"

const execute = (req: NextRequest) => executeSessionScopedNetlifyHandler(req, handler, { forceRepScope: true, includeDatabaseFreshness: true })

export const GET = execute
