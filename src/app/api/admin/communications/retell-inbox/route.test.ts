// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ auth: vi.fn(), read: vi.fn() }))
vi.mock("@/lib/auth-helpers", () => ({ requireAdministrator: mocks.auth }))
vi.mock("@/lib/prisma", () => ({ prisma: { operationalAction: { findMany: mocks.read } } }))
import { GET } from "./route"
beforeEach(() => { vi.resetAllMocks(); mocks.auth.mockResolvedValue({}); mocks.read.mockResolvedValue([]) })
it("does not expose the evidence inbox to non-administrators", async () => {
  mocks.auth.mockResolvedValue({ errorResponse: new Response(null, { status: 403 }) })
  expect((await GET()).status).toBe(403); expect(mocks.read).not.toHaveBeenCalled()
})
it("bounds the database-only read and excludes transcripts/recording URLs", async () => {
  const response = await GET()
  expect(response.status).toBe(200)
  expect(mocks.read).toHaveBeenCalledWith(expect.objectContaining({ take: 25, select: { id: true, entityId: true, createdAt: true } }))
  expect(response.headers.get("cache-control")).toBe("private, no-store")
})
