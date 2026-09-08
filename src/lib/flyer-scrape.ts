export function clean(value: unknown) {
  if (typeof value !== "string") return ""
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

export function extractMeta(html: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, "i"),
  ]
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) return clean(match[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"))
  }
  return ""
}

export function extractJsonLdProducts(html: string) {
  const results: Record<string, unknown>[] = []
  const scripts = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
  for (const match of scripts) {
    try {
      const value: unknown = JSON.parse(match[1].trim())
      const queue: unknown[] = Array.isArray(value) ? [...value] : [value]
      while (queue.length) {
        const item = queue.shift()
        if (!item || typeof item !== "object") continue
        const object = item as Record<string, unknown>
        if (Array.isArray(object["@graph"])) queue.push(...object["@graph"])
        const types = Array.isArray(object["@type"]) ? object["@type"] : [object["@type"]]
        if (types.includes("Product")) results.push(object)
      }
    } catch { /* malformed retailer JSON-LD */ }
  }
  return results
}
