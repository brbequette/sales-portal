import { Handler } from "@netlify/functions"
import { authenticateFunction, authErrorResponse } from "./lib/auth-middleware"

export const handler: Handler = async (event) => {
  const cors = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" }
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors, body: "" }
  try { await authenticateFunction(event, { requireAdmin: true }) } catch (error) { return authErrorResponse(error, cors) }
  return { statusCode: 409, headers: cors, body: JSON.stringify({ success: false, code: "PAYOUT_MUTATION_REQUIRES_LEDGER", error: "Payout updates and deletions are temporarily locked pending paid-status and ledger tracking." }) }
}
