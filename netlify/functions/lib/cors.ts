// Use the ALLOWED_ORIGIN env var in production (set in Netlify UI).
// Falls back to '*' only for local dev where the var isn't set.
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*'

export const corsHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS"
}

export function handleOptions() {
  return { statusCode: 204, headers: corsHeaders, body: "" }
}
