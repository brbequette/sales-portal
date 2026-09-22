import { handler } from "../../../../netlify/functions/get-accounts"
import { executeSessionScopedNetlifyHandler } from "@/lib/netlify-route-adapter"
import type { NextRequest } from "next/server"

const execute = (req: NextRequest) => executeSessionScopedNetlifyHandler(req, handler, { forceOwnerScope: true, includeDatabaseFreshness: true })

export const GET = execute
