// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest"
const m = vi.hoisted(() => ({ auth: vi.fn(), account: vi.fn(), scripts: vi.fn(), history: vi.fn(), ai: vi.fn() }))
vi.mock("../netlify/functions/lib/auth-middleware", () => ({ authenticateRequest: m.auth }))
vi.mock("../netlify/functions/lib/prisma", () => ({ prisma: { account: { findFirst: m.account }, callScript: { findMany: m.scripts }, callLog: { findMany: m.history } } }))
vi.mock("../src/lib/ai-client", () => ({ createAIChatCompletion: m.ai }))
import handler from "../netlify/functions/ai-script"
const invoke = (callType: string) => handler(new Request("http://localhost/api/ai-script", { method: "POST", body: JSON.stringify({ accountId: "a", accountName: "Fixture", callType }) }), {} as never)
beforeEach(() => {
  vi.resetAllMocks()
  m.auth.mockResolvedValue({ dbId: "rep", role: "AGENT" })
  m.account.mockResolvedValue({ id: "a", ownerId: "rep", bladeSizes: '14"', materialsCut: "Concrete" })
  m.scripts.mockResolvedValue([]); m.history.mockResolvedValue([])
  m.ai.mockResolvedValue({ response: { choices: [{ message: { content: "Generated" } }] } })
})
it("generates a cold-call sales offer and limits references to sales", async () => {
  expect((await invoke("Cold Call")).status).toBe(200)
  const prompt = m.ai.mock.calls[0][0].messages.map((message: { content: string }) => message.content).join(" ")
  expect(prompt).toContain("offer a suitable first order")
  expect(prompt).toContain('"materialsCut":"Concrete"')
  expect(prompt).not.toContain("DO NOT pitch")
  expect(prompt).not.toContain("use this exact strategy/hook")
  expect(m.scripts).toHaveBeenCalledWith({ where: { isActive: true, department: "SALES" } })
})
it("keeps explicitly requested collections references separate", async () => {
  expect((await invoke("Overdue Invoice")).status).toBe(200)
  expect(m.scripts).toHaveBeenCalledWith({ where: { isActive: true, department: "COLLECTIONS" } })
})
it("retains account authorization before reading history or generating", async () => {
  m.account.mockResolvedValue({ id: "a", ownerId: "other" })
  expect((await invoke("Cold Call")).status).toBe(403)
  expect(m.history).not.toHaveBeenCalled(); expect(m.ai).not.toHaveBeenCalled()
})
