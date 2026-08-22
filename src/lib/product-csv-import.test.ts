import { describe, expect, it } from "vitest"
import { buildZohoDescription, parseProductCsv } from "./product-csv-import"

describe("product CSV import", () => {
  it("normalizes attributes and inherits an image from the same handle", () => {
    const csv = `Handle,Title,Body (HTML),Vendor,Product Category,Type,Variant SKU,Variant Price,Image Src,Variant Grams,Cost per item,Equipment (product.metafields.custom.equipment),Blade material (product.metafields.shopify.blade-material),Suitable for material type (product.metafields.shopify.suitable-for-material-type),SEO Title,Option1 Name,Option1 Value,Status\nblade,Blade,<p>Ideal for cutting stone.</p>,Titan,Hardware > Blades,Stone Product,B-1,99,,1000,30,Angle Grinder,diamond; steel,granite; marble,Stone Blade,Arbor,5/8-11,active\nblade,,,,,,,,https://example.com/blade.jpg,,,,,,,,,`
    const [product] = parseProductCsv(csv)
    expect(product.imageUrl).toBe("https://example.com/blade.jpg")
    expect(product.toolType).toBe("Blade")
    expect(product.application).toBe("granite, marble")
    expect(product.materials).toEqual(["granite", "marble", "diamond", "steel"])
    expect(product.attributes["SEO Title"]).toBe("Stone Blade")
    expect(product.attributes["Option1 Name"]).toBe("Arbor")
    expect(buildZohoDescription(product)).toContain("Equipment: Angle Grinder")
    expect(buildZohoDescription(product)).toContain("SEO Title: Stone Blade")
  })

  it("extracts full size and equipment from the product description", () => {
    const csv = `Handle,Title,Body (HTML),Vendor,Product Category,Type,Variant SKU,Variant Price,Blade Diameter (product.metafields.custom.blade_diameter),Suitable for material type (product.metafields.shopify.suitable-for-material-type),Status
core-bit,Core Bit,"<p>Size: 1 1/2 X 1/2 Gas (38MM). Ideal for cutting all natural stone. Compatible with CNC Machine.</p>",Titan,Hardware > Tool Accessories,Stone Product,CB-1,129.97,1,all-natural-stone,active`
    const [product] = parseProductCsv(csv)
    expect(product.size).toBe("1 1/2 X 1/2 Gas (38MM)")
    expect(product.equipment).toBe("CNC Machine")
    expect(product.application).toBe("all natural stone")
  })
})
