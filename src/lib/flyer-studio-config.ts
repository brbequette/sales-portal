export type FlyerCatalogDefinition = {
  id: string
  label: string
  description: string
  matches: (product: { name: string; category: string; application?: string | null }) => boolean
}

/** Add another entry here to expose a future product catalog to Flyer Studio. */
export const FLYER_CATALOGS: FlyerCatalogDefinition[] = [
  {
    id: "diamond-cutting-blades",
    label: "Diamond Cutting Blades",
    description: "Titan blades for concrete, masonry, asphalt, stone, and tile cutting.",
    matches: (product) => /blade|saw blade/i.test(`${product.name} ${product.category} ${product.application || ""}`),
  },
]

/** Campaign types are data-driven so another delivery channel can be added centrally. */
export const FLYER_CAMPAIGN_TYPES = [
  { id: "SMS", label: "SMS / MMS", export: "sms" },
  { id: "EMAIL", label: "Email", export: "email" },
  { id: "PHONE", label: "Phone campaign", export: "email" },
] as const
