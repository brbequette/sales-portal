export type SalesCallType = "cold" | "update"
export type CallFacts = Partial<Record<"bladeSizes" | "materialsCut" | "currentSupplier" | "avgBladeCost" | "crewCount" | "bladesPerOrder" | "improvementPriority", string>>
export const CALL_FACT_KEYS = ["bladeSizes", "materialsCut", "currentSupplier", "avgBladeCost", "crewCount", "bladesPerOrder", "improvementPriority"] as const

export function inferSalesCallType(account: { lastPurchaseAt?: unknown; lastPurchaseDate?: unknown; totalRevenue?: unknown; status?: string } | null | undefined): SalesCallType {
  return account?.lastPurchaseAt || account?.lastPurchaseDate || Number(account?.totalRevenue) > 0 || /^(active|customer|repeat customer)$/i.test(account?.status || "") ? "update" : "cold"
}

export const SALES_OBJECTIONS = [
  { trigger: "Already have a supplier", response: "That makes sense. What would a second supplier need to do better to earn a small comparison order? We can start with one job instead of replacing your current source." },
  { trigger: "Price is too high", response: "Is the concern today's total or the cost of completing the job? Let's compare the correct size, application and quantity, then review the actual quote together." },
  { trigger: "Send information", response: "Which job and blade size should I tailor it to? What is the best email, and when should we review the quote together?" },
  { trigger: "Busy / not ready", response: "Understood. When is your next job or restock? What day and time would work for a short follow-up?" },
  { trigger: "Wrong person", response: "Who handles blade purchasing, and what is the best way and time to reach them? Thank you for pointing me in the right direction." },
  { trigger: "Not interested / do not call", response: "Understood, thank you for your time. If they request no further calls, stop the pitch and record the contact preference using the account controls." },
]

export function buildSalesCallFlow({ type, contactName = "there", repName = "your Titan representative", facts = {}, purchaseNames = [] }: {
  type: SalesCallType; contactName?: string; repName?: string; facts?: CallFacts; purchaseNames?: string[]
}) {
  const questions: Record<typeof CALL_FACT_KEYS[number], string> = {
    bladeSizes: "What blade sizes and saws are you running? Confirm arbor, RPM and wet/dry use before selecting a product.",
    materialsCut: "What material are you cutting on your next job?",
    currentSupplier: "Where do you currently buy your blades, and what works well about them?",
    avgBladeCost: "What do you normally pay for that size and application?",
    crewCount: "How many crews need blades?",
    bladesPerOrder: "How many blades do you normally order at a time?",
    improvementPriority: "What would you most like to improve: blade life, cutting speed, finish or cost?",
  }
  const known = CALL_FACT_KEYS.filter(key => String(facts[key] || "").trim())
  const missing = CALL_FACT_KEYS.filter(key => !String(facts[key] || "").trim())
  const summary = [facts.bladeSizes && `${facts.bladeSizes} blades`, facts.materialsCut && `cutting ${facts.materialsCut}`, facts.improvementPriority && `focused on ${facts.improvementPriority}`].filter(Boolean).join(", ")
  return [
    { id: "open", title: "Open & find the buyer", speech: `Hi ${contactName}, this is ${repName} with Titan Diamond USA. ${type === "cold" ? "We supply diamond tooling for cutting jobs. Are you the person who chooses blades for your crews? Do you have a minute so I can match an option to your work?" : `I'm calling to update your account and help with your next job.${purchaseNames.length ? ` How did ${purchaseNames.slice(0, 2).join(" and ")} work out?` : " How are your current blades working out?"} Are you still the right person for purchasing?`}`, guidance: "If the buyer is unavailable, get their name and a callback time. If now is inconvenient, arrange a follow-up." },
    { id: "discover", title: type === "cold" ? "Find the fit" : "Confirm & update facts", speech: `${known.length ? `I have some details on file${summary ? `: ${summary}` : ""}. Is that still accurate?\n\n` : "Let me ask a few quick questions so I can recommend the right fit.\n\n"}${missing.map(key => questions[key]).join("\n")}\n\nWhat job is coming up, and when will you need the blades?`, guidance: "Capture answers below. Confirm existing answers; ask missing questions naturally. You do not need all seven answers to discuss an offer." },
    { id: "offer", title: type === "cold" ? "Offer a first order" : "Recommend the next order", speech: `${summary ? `So you're using ${summary}. Have I got that right?` : "Let me confirm the application, saw setup and the improvement you need."}\n\n${type === "cold" ? "I'd like to earn your business with a first order matched to that job." : "Let's match your next order to what is working and what has changed."} I'll check the correct product and current pricing with you. Would you prefer a small comparison order or a quote for your normal quantity?`, guidance: "Use the product/order tools to verify compatibility, quantity, price, stock and delivery. Explain any approved promotion's paid quantity and full total; do not promise an unverified free sample, terms or performance guarantee." },
    { id: "resolve", title: "Resolve the concern", speech: "What would you need to feel comfortable moving forward: the product fit, the total, or the timing?", guidance: "Listen, use the objection responses, confirm that the concern is answered, then return to the quote. Respect a clear decline." },
    { id: "close", title: "Close or agree the next step", speech: "Would you like me to prepare that quote for your review? Before we finalize, let's confirm the product, quantity, full total, delivery address, timing and payment terms.\n\nIf you're not ready today, when should we review it together, and who else needs to be involved?", guidance: "Create a quote or order only after the customer agrees. Log the actual outcome, buyer, job need and agreed next step. Set a dated follow-up when appropriate; a pitch or quote is not an order." },
  ]
}

export function salesCallText(input: Parameters<typeof buildSalesCallFlow>[0]) {
  return buildSalesCallFlow(input).map((step, index) => `${index + 1}. ${step.title}\n${step.speech}\nRep cue: ${step.guidance}`).join("\n\n")
}

export function salesProductCandidates(facts: CallFacts) {
  const material = (facts.materialsCut || "").toLowerCase()
  const names = /tile|marble|granite|porcelain|ceramic/.test(material) ? ["Titan Razor Blade"]
    : /asphalt|green concrete/.test(material) ? ["The Titan"]
    : /concrete|brick|block|stone|paver/.test(material) ? ["The Medusa Blade", "The King Turbo", "The Dark Knight Blade"] : []
  return names.map(blade => ({ tier: "Verify fit", blade, pitch: `Let's check ${blade} against your ${facts.materialsCut} application${facts.bladeSizes ? ` and ${facts.bladeSizes} size` : ""}. ${facts.improvementPriority ? `You said ${facts.improvementPriority} matters most. ` : ""}I'll confirm the exact specification and current quote, then we can decide whether a small first order or your normal quantity makes sense. Rep cue: verify saw compatibility, pricing and any promotion in the catalog/order tools before committing.` }))
}

export function rankSalesScripts<T extends { department?: string; scenario?: string; callType?: string; priority?: number; name?: string }>(scripts: T[], department: string, type: SalesCallType) {
  const score = (script: T) => {
    const scenario = (script.scenario || "").toUpperCase()
    const matching = type === "cold" ? scenario === "INTRO" || /cold/i.test(script.callType || "") : scenario === "FOLLOW_UP" || /update|follow/i.test(script.callType || "")
    return (matching ? 1000 : scenario === "GENERAL" ? 500 : 0) + (script.priority || 0)
  }
  return scripts.filter(script => (script.department || "SALES") === department).sort((a, b) => score(b) - score(a))
}
