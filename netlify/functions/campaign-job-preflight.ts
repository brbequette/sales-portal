import type { Handler } from "@netlify/functions"
import { withFunctionAuth } from "./lib/auth-middleware"
import { corsHeaders } from "./lib/cors"
import { prisma } from "./lib/prisma"
import { normalizeE164 } from "./lib/campaign-deliverability"
import { guardSmsSend } from "../../src/lib/sms-suppression"
const impl: Handler = async event => {
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: corsHeaders, body: "method not allowed" }
  const { accountIds = [] } = JSON.parse(event.body || "{}")
  const accounts = await prisma.account.findMany({ where: { id: { in: accountIds } }, include: { contacts: true } })
  const numbers = accounts.map(account => normalizeE164((account.contacts.find(c => c.isPrimary) || account.contacts[0])?.mobilePhone || (account.contacts.find(c => c.isPrimary) || account.contacts[0])?.phone || ""))
  const decisions = await Promise.all(numbers.map(number => guardSmsSend({ phone: number || "", traffic: "PROMOTIONAL" })))
  const excluded = decisions.filter(decision => !decision.allowed)
  const reasons = excluded.reduce<Record<string, number>>((all, decision) => { const key = decision.reason || "Suppressed"; all[key] = (all[key] || 0) + 1; return all }, {})
  const invalid = numbers.filter(number => !number).length
  const protectedCount = decisions.filter(decision => decision.protectedSuppression).length
  const technicalCount = decisions.filter(decision => decision.technicalSuppression).length
  return { statusCode: 200, headers: { ...corsHeaders, "Cache-Control": "no-store" }, body: JSON.stringify({ success: true, selected: accountIds.length, excluded: excluded.length, protectedCount, technicalCount, invalidCount: invalid, sendable: accountIds.length - excluded.length, reasons }) }
}
export const handler = withFunctionAuth(impl, { requireAdmin: true })
