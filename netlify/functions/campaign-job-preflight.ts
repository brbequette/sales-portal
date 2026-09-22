import type { Handler } from "@netlify/functions"
import { withFunctionAuth } from "./lib/auth-middleware"
import { corsHeaders } from "./lib/cors"
import { prisma } from "./lib/prisma"
import { normalizeE164 } from "./lib/campaign-deliverability"
const impl: Handler = async event => {
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: corsHeaders, body: "method not allowed" }
  const { accountIds = [] } = JSON.parse(event.body || "{}")
  const accounts = await prisma.account.findMany({ where: { id: { in: accountIds } }, include: { contacts: true } })
  const numbers = accounts.map(account => normalizeE164((account.contacts.find(c => c.isPrimary) || account.contacts[0])?.mobilePhone || (account.contacts.find(c => c.isPrimary) || account.contacts[0])?.phone || ""))
  const records = await prisma.phoneDeliverability.findMany({ where: { normalizedPhone: { in: numbers.filter(Boolean) as string[] }, channel: "SMS", suppressionStatus: { not: "ELIGIBLE" } } })
  const reasons = records.reduce<Record<string, number>>((all, record) => { const key = record.suppressionReason || record.suppressionStatus; all[key] = (all[key] || 0) + 1; return all }, {})
  return { statusCode: 200, headers: { ...corsHeaders, "Cache-Control": "no-store" }, body: JSON.stringify({ success: true, selected: accountIds.length, excluded: records.length + numbers.filter(number => !number).length, reasons }) }
}
export const handler = withFunctionAuth(impl, { requireAdmin: true })
