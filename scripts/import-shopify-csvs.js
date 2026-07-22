const fs = require('fs')
const path = require('path')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

const csv1Path = `C:\\Users\\titan\\Documents\\Titan Diamond\\invoices\\Shopify Products - products_export_1 (3).csv`
const csv2Path = `C:\\Users\\titan\\Documents\\Titan Diamond\\invoices\\Shopify Products - products_export_1 (9) (1).csv`

// Simple CSV parser
function parseCSV(content) {
  const lines = content.split(/\r?\n/)
  if (lines.length === 0) return []
  
  // Parse header
  const headers = parseCSVLine(lines[0])
  const records = []
  
  let currentLine = ""
  for (let i = 1; i < lines.length; i++) {
    currentLine += (currentLine ? "\n" : "") + lines[i]
    // Check if quotes are balanced
    const quoteCount = (currentLine.match(/"/g) || []).length
    if (quoteCount % 2 === 0) {
      if (currentLine.trim()) {
        const values = parseCSVLine(currentLine)
        const row = {}
        headers.forEach((h, idx) => {
          row[h] = values[idx] || ""
        })
        records.push(row)
      }
      currentLine = ""
    }
  }
  return records
}

function parseCSVLine(line) {
  const values = []
  let current = ""
  let inQuotes = false
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim())
      current = ""
    } else {
      current += char
    }
  }
  values.push(current.trim())
  return values
}

function standardizeCategory(type, catStr) {
  const t = (type || "").trim()
  const c = (catStr || "").trim()
  
  if (t === "Saw Blade" || c.includes("Saw Blades")) return "Saw Blades"
  if (t === "Core Bit" || c.includes("Drill Bits")) return "Core Bits"
  if (t === "Cup Wheel" || c.includes("Grinding")) return "Cup Wheels & Grinding"
  if (t === "Tile Blade") return "Tile & Porcelain Blades"
  if (t === "Turbo Blade") return "Turbo Blades"
  if (t === "Tuck Point") return "Tuck Point Blades"
  if (t === "Stone Product" || c.includes("Polishing")) return "Stone & Polishing"
  if (t === "Zenesis" || t === "Pro-Blade") return "Zenesis & Premium Series"
  
  return t || "General Hardware"
}

async function main() {
  console.log("Reading CSV files...")
  const content1 = fs.readFileSync(csv1Path, 'utf8')
  const content2 = fs.readFileSync(csv2Path, 'utf8')
  
  const records1 = parseCSV(content1)
  const records2 = parseCSV(content2)
  
  console.log(`Parsed ${records1.length} rows from CSV 1 and ${records2.length} rows from CSV 2.`)
  
  // Index File 1 by Handle / Title / SKU
  const file1Map = new Map()
  for (const r of records1) {
    const key = r["Handle"] || r["Title"] || r["Variant SKU"]
    if (key) file1Map.set(key, r)
  }
  
  // Merge products
  const productMap = new Map()
  
  // Process File 1 first
  for (const r of records1) {
    const sku = r["Variant SKU"] || r["Handle"] || r["Title"]
    if (!sku) continue
    
    const cat = standardizeCategory(r["Type"], r["Product Category"])
    const cost = parseFloat(r["Cost per item"] || 0)
    const price = parseFloat(r["Variant Price"] || 0)
    const diameter = r["Blade Diameter (product.metafields.custom.blade_diameter)"] || ""
    const equipment = r["Equipment (product.metafields.custom.equipment)"] || ""
    const segmentHeight = r["Segment Height (product.metafields.custom.segment_height)"] || ""
    const slotType = r["Slot Type (product.metafields.custom.slot_type)"] || ""
    const suitableFor = r["Suitable for material type (product.metafields.shopify.suitable-for-material-type)"] || ""
    
    productMap.set(sku, {
      sku,
      name: r["Title"] || sku,
      category: cat,
      price,
      cost,
      vendor: r["Vendor"] || "Titan Diamond",
      size: diameter ? `${diameter}"` : null,
      equipment,
      segmentHeight,
      slotType,
      suitableFor,
      tags: r["Tags"] || "",
      description: r["Body (HTML)"] || ""
    })
  }
  
  // Enrich / Overwrite with File 2
  for (const r of records2) {
    const sku = r["Variant SKU"] || r["Handle"] || r["Title"]
    if (!sku) continue
    
    const existing = productMap.get(sku) || {
      sku,
      name: r["Title"] || sku,
      category: standardizeCategory(r["Type"], r["Product Category"]),
      price: parseFloat(r["Variant Price"] || 0),
      cost: parseFloat(r["Cost per item"] || 0),
      vendor: r["Vendor"] || "Titan Diamond",
      size: null,
      equipment: "",
      segmentHeight: "",
      slotType: "",
      suitableFor: "",
      tags: "",
      description: r["Body (HTML)"] || ""
    }
    
    // Enrich tags & categories
    if (r["Tags"]) {
      existing.tags = existing.tags ? `${existing.tags}, ${r["Tags"]}` : r["Tags"]
    }
    if (r["Type"]) {
      existing.category = standardizeCategory(r["Type"], r["Product Category"])
    }
    if (parseFloat(r["Variant Price"] || 0) > 0) {
      existing.price = parseFloat(r["Variant Price"])
    }
    if (parseFloat(r["Cost per item"] || 0) > 0) {
      existing.cost = parseFloat(r["Cost per item"])
    }
    
    productMap.set(sku, existing)
  }
  
  console.log(`Merged ${productMap.size} unique products. Upserting to Database...`)
  
  let upserted = 0
  let errors = 0
  
  for (const [sku, p] of productMap.entries()) {
    try {
      const descObj = JSON.stringify({
        text: p.description || p.name,
        cost: p.cost,
        vendor: p.vendor,
        retail: p.price,
        equipment: p.equipment,
        bladeDiameter: p.size,
        segmentHeight: p.segmentHeight,
        slotType: p.slotType,
        suitableFor: p.suitableFor,
        tags: p.tags,
        status: "active"
      })
      
      await prisma.product.upsert({
        where: { sku },
        update: {
          name: p.name,
          category: p.category,
          price: p.price,
          description: descObj,
          size: p.size,
          application: p.equipment,
          vendor: p.vendor
        },
        create: {
          sku,
          name: p.name,
          category: p.category,
          price: p.price,
          description: descObj,
          size: p.size,
          application: p.equipment,
          vendor: p.vendor
        }
      })
      upserted++
    } catch (e) {
      console.error(`Error upserting ${sku}:`, e.message)
      errors++
    }
  }
  
  console.log(`✅ Finished importing! Successfully upserted ${upserted} products (${errors} errors).`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
