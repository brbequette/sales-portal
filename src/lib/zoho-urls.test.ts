import { describe, expect, it } from "vitest"

import { getZohoBooksUrl } from "./zoho-urls"

describe("getZohoBooksUrl", () => {
  it.each(["Quote", "quote", "quotes", "estimate", "estimates"])(
    "uses the current Zoho Books quotes route for %s",
    (documentType) => {
      expect(getZohoBooksUrl(documentType, "1254360000051081684")).toBe(
        "https://books.zoho.com/app/664670946#/quotes/1254360000051081684",
      )
    },
  )
})
