import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import InvoiceReturnModal from "./InvoiceReturnModal"
import { RETURN_OFFICE } from "@/lib/invoice-return"
const line = { lineId: "line", name: "Blade", quantity: 1, unitCredit: 100, sku: "B" }
let requests: any[]
let saved: any
beforeEach(() => {
  requests = []; saved = null
  vi.stubGlobal("fetch", vi.fn(async (_url, options) => {
    if (!options) return { ok: true, json: async () => ({ origin: RETURN_OFFICE, destination: RETURN_OFFICE, lines: [line], returns: saved ? [saved] : [], canManage: true, booksInvoiceId: "1254360000040824889" }) }
    const body = JSON.parse(options.body); requests.push(body)
    saved = { id: body.returnId, reason: body.reason, status: body.action === "purchase" ? "LABEL_PENDING" : "QUOTED", costResponsibility: "TITAN", snapshot: { origin: RETURN_OFFICE, destination: RETURN_OFFICE, box: { length: 17, width: 17, height: 1, weight: 10 }, lines: [line] }, rates: [{ courierServiceId: "service", courierName: "Ground", totalCharge: 17 }] }
    return { ok: true, json: async () => ({ success: true, return: saved }) }
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
describe("return modal", () => {
  it("gets rates first and only purchases after service and price selection", async () => {
    const onSuccess = vi.fn()
    render(<InvoiceReturnModal invoice={{ id: "local", invoice_number: "10638" }} onClose={vi.fn()} onSuccess={onSuccess} />)
    await screen.findByText("Items being returned")
    fireEvent.change(screen.getByLabelText(/Return quantity/), { target: { value: "1" } })
    for (const label of [/length \(in\)/i, /width \(in\)/i, /height \(in\)/i, /weight \(lb\)/i]) fireEvent.change(screen.getByLabelText(label), { target: { value: "10" } })
    fireEvent.change(screen.getByLabelText("Reason for return"), { target: { value: "Cancelled" } })
    fireEvent.change(screen.getByLabelText("Who pays return freight?"), { target: { value: "TITAN" } })
    fireEvent.click(screen.getByText("Review shipping rates"))
    await screen.findByText("Choose a service")
    expect(requests.map(request => request.action)).toEqual(["quote"])
    expect(onSuccess).not.toHaveBeenCalled()
    expect((screen.getByRole("button", { name: "Buy return label" }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole("radio"))
    fireEvent.click(screen.getByRole("button", { name: "Buy return label — $17.00" }))
    await waitFor(() => expect(requests).toHaveLength(2))
    expect(requests[1]).toMatchObject({ action: "purchase", approvedCostCents: 1700, returnId: requests[0].returnId })
    await screen.findByText("LABEL PENDING")
    expect(screen.queryByText("Print return label")).toBeNull()
    expect(onSuccess).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Close return" }))
    expect(onSuccess).toHaveBeenCalledOnce()
  })
  it("renders through a body portal with a named dialog", async () => {
    const { container } = render(<InvoiceReturnModal invoice={{ id: "local" }} onClose={vi.fn()} onSuccess={vi.fn()} />)
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(screen.getByRole("dialog", { name: "Return to Scottsdale" })).toBeTruthy()
    await screen.findByText("Items being returned")
  })
})
