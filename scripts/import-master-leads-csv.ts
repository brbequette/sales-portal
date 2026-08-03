import fs from "fs"
import readline from "readline"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
const MASTER_CSV_FILE = "c:/Users/titan/Documents/Titan Diamond/leads/MASTER LIST.csv"

function cleanPhone(p: string | null | undefined): string {
  if (!p) return ""
  const digits = p.replace(/\D/g, "")
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1)
  if (digits.length === 10) return digits
  return ""
}

function cleanStr(s: string | null | undefined): string {
  if (!s) return ""
  return s.trim()
}

function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ""
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim().replace(/^"|"$/g, ''))
      current = ""
    } else {
      current += char
    }
  }
  result.push(current.trim().replace(/^"|"$/g, ''))
  return result
}

async function main() {
  console.log(`🚀 Starting MASTER LIST Lead Import from: ${MASTER_CSV_FILE}`)
  
  if (!fs.existsSync(MASTER_CSV_FILE)) {
    console.error(`❌ Master CSV File not found: ${MASTER_CSV_FILE}`)
    process.exit(1)
  }

  // 1. Get default lead owner
  const defaultUser = await prisma.user.findFirst({
    where: { role: { contains: "Admin", mode: "insensitive" } }
  }) || await prisma.user.findFirst()

  if (!defaultUser) {
    console.error("❌ No database user found for lead owner.")
    process.exit(1)
  }
  const defaultOwnerId = defaultUser.id
  console.log(`👤 Default Lead Owner: ${defaultUser.name} (${defaultUser.id})`)

  // 2. Pre-load existing leads from DB to prevent duplicates in O(1) time
  console.log("🔍 Pre-loading existing DB leads to enforce zero duplication...")
  const dbLeads = await prisma.lead.findMany({
    select: { email: true, phone: true, mobile: true, firstName: true, lastName: true, company: true, zohoId: true }
  })

  const existingEmails = new Set<string>()
  const existingPhones = new Set<string>()
  const existingKeys = new Set<string>()
  const existingZohoIds = new Set<string>()

  for (const l of dbLeads) {
    if (l.zohoId) existingZohoIds.add(l.zohoId)
    if (l.email) existingEmails.add(l.email.trim().toLowerCase())
    const p1 = cleanPhone(l.phone)
    if (p1) existingPhones.add(p1)
    const p2 = cleanPhone(l.mobile)
    if (p2) existingPhones.add(p2)
    
    const k = `${cleanStr(l.firstName).toLowerCase()}_${cleanStr(l.lastName).toLowerCase()}_${cleanStr(l.company).toLowerCase()}`
    if (k.length > 5) existingKeys.add(k)
  }

  console.log(`📊 DB Pre-loaded: ${existingEmails.size} emails, ${existingPhones.size} phones, ${existingKeys.size} contact keys.`)

  // 3. Read Master CSV Line-by-Line
  const fileStream = fs.createReadStream(MASTER_CSV_FILE)
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity })

  let headers: string[] = []
  let lineNumber = 0
  let skippedCount = 0
  let newConfirmedCount = 0
  let newQuestionableCount = 0

  const batch: any[] = []
  const BATCH_SIZE = 500

  for await (const line of rl) {
    lineNumber++
    if (lineNumber === 1) {
      headers = parseCsvLine(line)
      continue
    }
    if (!line.trim()) continue

    const vals = parseCsvLine(line)
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => { row[h] = vals[idx] || "" })

    const company = cleanStr(row["company_name"]) || "Unnamed Company"
    const compUpper = company.toUpperCase()
    const firstName = cleanStr(row["First Name"]) || null
    let lastName = cleanStr(row["Last Name"]) || cleanStr(row["contact_name"]) || "Lead"
    if (firstName && lastName.startsWith(firstName)) {
      lastName = lastName.replace(firstName, "").trim() || "Lead"
    }

    const email = cleanStr(row["contact_email"] || row["company_email"]) || null
    const phone = cleanStr(row["contact_phone"] || row["company_phone"]) || null
    const mobile = cleanStr(row["contact_mobile"]) || null
    const title = cleanStr(row["specialty"]) || null
    const industry = cleanStr(row["projects"]) || null
    const street = cleanStr(row["Address"] || row["Add1"]) || null
    const city = cleanStr(row["City"]) || null
    const state = cleanStr(row["State"]) || null
    const zip = cleanStr(row["Zip"]) || null

    const cleanP = cleanPhone(phone)
    const cleanM = cleanPhone(mobile)
    const lowerEmail = email ? email.toLowerCase() : null
    const fullNameKey = `${(firstName || '').toLowerCase()}_${(lastName || '').toLowerCase()}_${company.toLowerCase()}`

    // DE-DUPLICATION CHECK
    let isDuplicate = false
    if (lowerEmail && existingEmails.has(lowerEmail)) isDuplicate = true
    else if (cleanP && existingPhones.has(cleanP)) isDuplicate = true
    else if (cleanM && existingPhones.has(cleanM)) isDuplicate = true
    else if (fullNameKey.length > 5 && existingKeys.has(fullNameKey)) isDuplicate = true

    if (isDuplicate) {
      skippedCount++
      continue
    }

    // Register in memory to prevent internal duplicates within Master CSV
    if (lowerEmail) existingEmails.add(lowerEmail)
    if (cleanP) existingPhones.add(cleanP)
    if (cleanM) existingPhones.add(cleanM)
    if (fullNameKey.length > 5) existingKeys.add(fullNameKey)

    const zohoId = `master_lead_${lineNumber}_${Date.now()}`
    const companyGroupId = compUpper.replace(/[^A-Z0-9]/g, "") || "UNKNOWN_GROUP"

    // Default matching classification
    const matchStatus = "CONFIRMED"
    const matchReason = null
    newConfirmedCount++

    batch.push({
      zohoId,
      company,
      firstName,
      lastName,
      email,
      phone,
      mobile,
      title,
      industry,
      status: "New Lead",
      ownerId: defaultOwnerId,
      street,
      city,
      state,
      zip,
      matchStatus,
      matchReason,
      companyGroupId,
      rawData: row
    })

    if (batch.length >= BATCH_SIZE) {
      await prisma.lead.createMany({
        data: batch,
        skipDuplicates: true
      })
      batch.length = 0
      console.log(`💾 Processed ${lineNumber} rows... (Imported: ${newConfirmedCount}, Skipped Duplicates: ${skippedCount})`)
    }
  }

  if (batch.length > 0) {
    await prisma.lead.createMany({
      data: batch,
      skipDuplicates: true
    })
  }

  const finalTotalCount = await prisma.lead.count()

  console.log("\n✅ MASTER LIST IMPORT COMPLETE!")
  console.log(` 📊 Total Rows Processed: ${lineNumber - 1}`)
  console.log(` ⏭️ Duplicates Skipped: ${skippedCount}`)
  console.log(` 🟢 New Confirmed Leads Added: ${newConfirmedCount}`)
  console.log(` 🏢 Total Leads in PostgreSQL: ${finalTotalCount}`)

  process.exit(0)
}

main().catch(err => {
  console.error("❌ Master Lead Import Failed:", err)
  process.exit(1)
})
