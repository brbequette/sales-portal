export const SCRIPT_DEPARTMENTS = ["SALES", "COLLECTIONS", "SUPPORT", "SHIPPING"] as const
export const SCRIPT_SCENARIOS = ["GENERAL", "INTRO", "FOLLOW_UP", "REACTIVATION", "QUOTE", "ORDER", "PAYMENT", "DELIVERY", "PROBLEM", "ESCALATION"] as const

export type ObjectionResponse = { trigger: string; response: string }

export function stringList(value: unknown) {
  return Array.isArray(value) ? value.map(item => String(item).trim()).filter(Boolean).slice(0, 20) : []
}

export function objectionList(value: unknown): ObjectionResponse[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(item => {
    if (!item || typeof item !== "object") return []
    const trigger = String((item as Record<string, unknown>).trigger || "").trim()
    const response = String((item as Record<string, unknown>).response || "").trim()
    return trigger && response ? [{ trigger, response }] : []
  }).slice(0, 30)
}

export function normalizeScriptInput(body: Record<string, unknown>) {
  const department = String(body.department || "SALES").toUpperCase()
  const scenario = String(body.scenario || "GENERAL").toUpperCase()
  if (!SCRIPT_DEPARTMENTS.includes(department as typeof SCRIPT_DEPARTMENTS[number])) throw new Error("Unsupported department")
  if (!SCRIPT_SCENARIOS.includes(scenario as typeof SCRIPT_SCENARIOS[number])) throw new Error("Unsupported scenario")
  return {
    name: String(body.name || "").trim(),
    callType: String(body.callType || scenario).trim(),
    department,
    scenario,
    objective: String(body.objective || "").trim() || null,
    content: String(body.content || "").trim(),
    discoveryPrompts: stringList(body.discoveryPrompts),
    objectionResponses: objectionList(body.objectionResponses),
    closingPrompt: String(body.closingPrompt || "").trim() || null,
    priority: Math.max(0, Math.min(100, Number(body.priority) || 0)),
    isActive: body.isActive !== false,
  }
}
