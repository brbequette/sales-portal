import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const orderBuilder = vi.fn((props: unknown) => {
  void props
  return <div data-testid="real-order-builder" />
})

vi.mock("./OrderBuilder", () => ({
  OrderBuilder: (props: unknown) => orderBuilder(props),
}))

import { StandaloneOrderBuilder } from "./StandaloneOrderBuilder"

describe("StandaloneOrderBuilder", () => {
  it("routes POS submissions through the shared authenticated order builder", () => {
    const onSuccess = vi.fn()
    const onCancel = vi.fn()
    const account = { id: "local-account", crmAccountId: "crm-account", booksCustomerId: "books-customer" }

    render(
      <StandaloneOrderBuilder
        accountId="local-account"
        accountName="Test Account"
        accountDetail={account}
        onSuccess={onSuccess}
        onCancel={onCancel}
      />,
    )

    expect(screen.getByTestId("real-order-builder")).toBeTruthy()
    expect(orderBuilder).toHaveBeenCalledWith(expect.objectContaining({
      accountId: "local-account",
      accountName: "Test Account",
      accountDetail: account,
      onSuccess,
      onCancel,
    }))
    expect(screen.queryByText("Submit Order")).toBeNull()
  })
})
