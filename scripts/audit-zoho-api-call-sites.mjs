import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const roots = ["src", "netlify/functions", "scripts"]
const extensions = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".py", ".ps1"])
const providerPattern = /www\.zohoapis|accounts\.zoho|voice\.zoho\.com|getZohoAccessToken\s*\(/

function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(directory, entry.name)
    return entry.isDirectory() ? files(target) : extensions.has(path.extname(entry.name)) ? [target] : []
  })
}

function invokedBy(file) {
  const normalized = file.replaceAll("\\", "/")
  if (normalized.startsWith("scripts/")) return "manual script"
  if (normalized.includes("bounded-books-auto-sync")) return "15-minute bounded schedule when explicitly enabled"
  if (normalized.includes("daily-books-sync")) return "daily scheduled Full Sync"
  if (normalized.includes("automation-engine")) return "5-minute automation schedule"
  if (normalized.includes("process-scheduled-messages")) return "5-minute messaging schedule"
  if (normalized.includes("email-sync")) return "3-minute email schedule"
  if (normalized.includes("webhook")) return "provider webhook"
  if (normalized.includes("src/app/api/") || normalized.startsWith("netlify/functions/")) return "authenticated user action or internal API invocation"
  return "shared helper invoked by its callers"
}

export function auditZohoApiCallSites() {
  return roots.flatMap(root => files(root)).flatMap(file => fs.readFileSync(file, "utf8").split(/\r?\n/).flatMap((line, index) => {
    if (!providerPattern.test(line)) return []
    return [{ file: file.replaceAll("\\", "/"), line: index + 1, invokedBy: invokedBy(file), paginatedOrBounded: /page|per_page|date_start|date_end/.test(line) ? "visible at call site" : "inspect caller", call: line.trim().slice(0, 240) }]
  }))
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const sites = auditZohoApiCallSites()
  process.stdout.write(`${JSON.stringify({ generatedAt: new Date().toISOString(), directAndTokenCallSiteCount: sites.length, sites }, null, 2)}\n`)
}
