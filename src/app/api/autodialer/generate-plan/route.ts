import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { createAIChatCompletion } from "@/lib/ai-client"

function extractJson(text: string) {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error("AI returned no usable sequence")
  return JSON.parse(match[0])
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  const body = await request.json()
  const selected = body.scriptId ? await prisma.callScript.findFirst({ where: { id: String(body.scriptId), isActive: true } }) : null
  const references = await prisma.callScript.findMany({ where: { isActive: true, department: "SALES" }, orderBy: [{ priority: "desc" }, { updatedAt: "desc" }], take: 6 })
  const language = [selected, ...references.filter(item => item.id !== selected?.id)].filter(Boolean).map(item => `SCRIPT: ${item!.name}\n${item!.content}`).join("\n\n").slice(0, 14000)
  const { response } = await createAIChatCompletion({
    messages: [
      { role: "system", content: "Create coordinated B2B outreach for Titan Diamond USA. Match the vocabulary, cadence, value proposition, and sales approach in the approved uploaded scripts. Do not invent prices, guarantees, or customer facts. Return JSON only with keys callScript, smsBody, emailSubject, emailBody. Use {{contactName}}, {{accountName}}, and {{repName}} merge tags. SMS must be concise and identify Titan Diamond USA." },
      { role: "user", content: `Build a call-first, text-follow-up, and email-follow-up sequence. Approved language:\n\n${language || "No uploaded script was available; use a professional contractor-focused Titan Diamond approach."}` },
    ], temperature: 0.45, max_tokens: 1400,
  })
  try { return NextResponse.json({ success: true, plan: extractJson(response.choices[0]?.message?.content || "") }) }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to parse AI sequence" }, { status: 502 }) }
}
