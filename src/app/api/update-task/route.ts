import { handler } from "../../../../netlify/functions/update-task"
import { executeSessionScopedNetlifyHandler } from "@/lib/netlify-route-adapter"
import type { NextRequest } from "next/server"

const execute = (req: NextRequest) => executeSessionScopedNetlifyHandler(req, handler)

export const GET = execute
export const POST = execute
export const PUT = execute
export const DELETE = execute
export const OPTIONS = execute
