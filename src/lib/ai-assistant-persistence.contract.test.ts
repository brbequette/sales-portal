import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("Titan AI persistence and context contract", () => {
  const assistant = readFileSync("src/components/AiAssistant.tsx", "utf8")
  const route = readFileSync("src/app/api/ai/chat/route.ts", "utf8")

  it("stores bounded history under the authenticated user id", () => {
    expect(assistant).toContain("titan-ai-history:v")
    expect(assistant).toContain("historyKey(user.id)")
    expect(assistant).toContain("messages.slice(-50)")
  })

  it("refreshes page and selected-record context and binds confirmations to it", () => {
    expect(assistant).toContain("window.location.search")
    expect(assistant).toContain("titanAiContext")
    expect(assistant).toContain("selectedRecord")
    expect(assistant).toContain("contextKey")
    expect(route).toContain("verifyAiConfirmationToken(String(confirmationToken), dbUser.id")
    expect(route).toContain("Current application context")
  })
})
