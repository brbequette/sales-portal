import type { Handler } from "@netlify/functions"
import { withFunctionAuth } from "./lib/auth-middleware"
import { corsHeaders, handleOptions } from "./lib/cors"

// Direct bulk sending is retired because it bypassed durable recipient claims.
const retired: Handler = async event => event.httpMethod === "OPTIONS" ? handleOptions() : ({ statusCode: 410, headers: corsHeaders, body: JSON.stringify({ success: false, message: "Legacy bulk sender retired. Use /api/campaign-job/create." }) })
export const handler = withFunctionAuth(retired, { requireAdmin: true })
