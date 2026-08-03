import fs from "fs"
import readline from "readline"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
const CSV_FILE = "c:/Users/titan/Documents/Titan Diamond/leads/Leads_2026_08_02.csv"

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
  console.log(`🚀 Starting Lead Import & Matching Engine from: ${CSV_FILE}`)
  
  if (!fs.existsSync(CSV_FILE)) {
    console.error(`❌ CSV File not found: ${CSV_FILE}`)
    process.exit(1)
  }

  // Fetch Default User (Benjamin Bequette or Admin) for ownerId fallback
  const defaultUser = await prisma.user.findFirst({
    where: { role: { contains: "Admin", mode: "insensitive" } }
  }) || await prisma.user.findFirst()

  if (!defaultUser) {
    console.error("❌ No database user found to set as lead owner.")
    process.exit(1)
  }

  const defaultOwnerId = defaultUser.id
  console.log(`👤 Default Lead Owner assigned: ${defaultUser.name} (${defaultUser.id})`)

  const fileStream = fs.createReadStream(CSV_FILE)
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity })

  let headers: string[] = []
  let rawRows: Record<string, string>[] = []
  let lineNumber = 0

  for await (const line of rl) {
    lineNumber++
    if (lineNumber === 1) {
      headers = parseCsvLine(line)
      continue
    }
    if (!line.trim()) continue

    const vals = parseCsvLine(line)
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => {
      row[h] = vals[idx] || ""
    })
    rawRows.push(row)
  }

  console.log(`📊 Loaded ${rawRows.length} raw lead records from CSV. Running matching engine...`)

  // First Pass: Build Phone & Address Maps to detect discrepancies
  const phoneToCompaniesMap = new Map<string, Set<string>>()
  const addressToCompaniesMap = new Map<string, Set<string>>()

  for (const row of rawRows) {
    const company = cleanStr(row["Company"] || row["Lead Name"] || "Unnamed Company").toUpperCase()
    const phone = cleanPhone(row["Phone"])
    const mobile = cleanPhone(row["Mobile"])
    const street = cleanStr(row["Street"]).toUpperCase()
    const city = cleanStr(row["City"]).toUpperCase()
    const zip = cleanStr(row["Zip Code"])
    const fullAddr = street && city ? `${street}, ${city} ${zip}` : ""

    if (phone) {
      if (!phoneToCompaniesMap.has(phone)) phoneToCompaniesMap.set(phone, new Set())
      phoneToCompaniesMap.get(phone)!.add(company)
    }
    if (mobile) {
      if (!phoneToCompaniesMap.has(mobile)) phoneToCompaniesMap.set(mobile, new Set())
      phoneToCompaniesMap.get(mobile)!.add(company)
    }
    if (fullAddr) {
      if (!addressToCompaniesMap.has(fullAddr)) addressToCompaniesMap.set(fullAddr, new Set())
      addressToCompaniesMap.get(fullAddr)!.add(company)
    }
  }

  console.log(`🔍 Discrepancy Maps compiled: ${phoneToCompaniesMap.size} unique phones, ${addressToCompaniesMap.size} unique addresses.`)

  // Second Pass: Process & Upsert Leads with Classification
  let confirmedCount = 0
  let questionableCount = 0
  let batch: any[] = []
  const BATCH_SIZE = 500

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i]
    const zohoId = cleanStr(row["Record Id"]) || `lead_import_${i + 1}_${Date.now()}`
    const company = cleanStr(row["Company"] || row["Lead Name"] || "Unnamed Company")
    const compUpper = company.toUpperCase()
    const firstName = cleanStr(row["First Name"]) || null
    const lastName = cleanStr(row["Last Name"]) || cleanStr(row["Lead Name"]) || "Lead"
    const email = cleanStr(row["Email"]) || null
    const phone = cleanStr(row["Phone"]) || null
    const mobile = cleanStr(row["Mobile"]) || null
    const title = cleanStr(row["Title"]) || null
    const industry = cleanStr(row["Industry"]) || null
    const status = cleanStr(row["Lead Status"]) || "New Lead"
    const street = cleanStr(row["Street"]) || null
    const city = cleanStr(row["City"]) || null
    const state = cleanStr(row["State"]) || null
    const zip = cleanStr(row["Zip Code"]) || null
    const isConverted = cleanStr(row["Is Converted"]) === "true" || status.toLowerCase() === "converted"

    const cleanP = cleanPhone(phone)
    const cleanM = cleanPhone(mobile)
    const fullAddr = street && city ? `${street.toUpperCase()}, ${city.toUpperCase()} ${zip || ''}` : ""

    const matchingPhonesComps = new Set<string>()
    if (cleanP && phoneToCompaniesMap.has(cleanP)) {
      phoneToCompaniesMap.get(cleanP)!.forEach(c => matchingPhonesComps.add(c))
    }
    if (cleanM && phoneToCompaniesMap.has(cleanM)) {
      phoneToCompaniesMap.get(cleanM)!.forEach(c => matchingPhonesComps.add(c))
    }

    const matchingAddrComps = addressToCompaniesMap.get(fullAddr) || new Set<string>()

    let matchStatus = "CONFIRMED"
    let matchReason: string | null = null

    // Check for conflicting company names on phone or address
    const conflictingPhoneComps = Array.from(matchingPhonesComps).filter(c => c !== compUpper)
    const conflictingAddrComps = Array.from(matchingAddrComps).filter(c => c !== compUpper)

    if (conflictingPhoneComps.length > 0) {
      matchStatus = "QUESTIONABLE"
      matchReason = `Phone number matches conflicting companies: ${conflictingPhoneComps.join(", ")}`
    } else if (conflictingAddrComps.length > 0) {
      matchStatus = "QUESTIONABLE"
      matchReason = `Address matches conflicting companies: ${conflictingAddrComps.join(", ")}`
    }

    if (matchStatus === "CONFIRMED") confirmedCount++
    else questionableCount++

    const companyGroupId = compUpper.replace(/[^A-Z0-9]/g, "")

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
      status: isConverted ? "Converted" : status,
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

    if (batch.length >= BATCH_SIZE || i === rawRows.length - 1) {
      for (const item of batch) {
        await prisma.lead.upsert({
          where: { zohoId: item.zohoId },
          update: {
            company: item.company,
            firstName: item.firstName,
            lastName: item.lastName,
            email: item.email,
            phone: item.phone,
            mobile: item.mobile,
            title: item.title,
            industry: item.industry,
            status: item.status,
            street: item.street,
            city: item.city,
            state: item.state,
            zip: item.zip,
            matchStatus: item.matchStatus,
            matchReason: item.matchReason,
            companyGroupId: item.companyGroupId,
            rawData: item.rawData
          },
          create: item
        })
      }
      console.log(`💾 Processed ${i + 1}/${rawRows.length} leads...`)
      batch = []
    }
  }

  console.log(`\n✅ LEAD IMPORT COMPLETE!`)
  console.log(` Total Leads Imported: ${rawRows.length}`)
  console.log(` 🟢 100% Confirmed Matches: ${confirmedCount}`)
  console.log(` 🟡 Questionable Discrepancies: ${questionableCount}`)
}

main()
  .catch(e => {
    console.error("❌ Fatal Import Error:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
