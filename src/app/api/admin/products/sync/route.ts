import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import fs from 'fs'
import { parse } from 'csv-parse/sync'

export async function POST() {
  try {
    const csvPath = 'C:\\Users\\titan\\Documents\\Titan Diamond\\invoices\\Item (13).csv'
    if (!fs.existsSync(csvPath)) {
      return NextResponse.json({ error: 'CSV file not found at ' + csvPath }, { status: 404 })
    }

    const fileContent = fs.readFileSync(csvPath, 'utf8')
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      relax_quotes: true,
    })

    let count = 0

    // Using transaction for faster inserts/updates if possible, but upsert with a loop is safer for data mapping.
    // We will do a sequential loop to avoid transaction timeouts on 4600 rows.
    for (const record of records as any[]) {
      const sku = record['SKU']?.trim()
      const name = record['Item Name']?.trim() || record['Product Name']?.trim()
      if (!sku || !name) continue

      let price = 0
      const rateStr = record['Rate']
      if (rateStr) {
        price = parseFloat(rateStr.replace(/[^\d.-]/g, ''))
        if (isNaN(price)) price = 0
      }

      let stock = 0
      const stockStr = record['Stock On Hand'] || record['Opening Stock']
      if (stockStr) {
        stock = parseInt(stockStr, 10)
        if (isNaN(stock)) stock = 0
      }

      const description = record['Description'] || record['Item Description'] || ''
      const manufacturer = record['Manufacturer'] || ''
      const vendor = record['Vendor'] || ''

      const cfSubjectToMarkupStr = record['CF.SUBJECT TO SALES MARKUP']
      const cfSubjectToMarkup = cfSubjectToMarkupStr ? cfSubjectToMarkupStr.toLowerCase() === 'true' : true

      const cfGiftItemStr = record['CF.GIFT ITEM']
      const cfGiftItem = cfGiftItemStr ? cfGiftItemStr.toLowerCase() === 'true' : false

      await prisma.product.upsert({
        where: { sku },
        update: {
          name,
          description,
          price,
          stock,
          manufacturer,
          vendor,
          subjectToVig: cfSubjectToMarkup,
          giftItem: cfGiftItem,
        },
        create: {
          sku,
          name,
          description,
          price,
          stock,
          manufacturer,
          vendor,
          subjectToVig: cfSubjectToMarkup,
          giftItem: cfGiftItem,
          category: 'General',
        },
      })

      count++
    }

    return NextResponse.json({ success: true, count, message: `Synced ${count} products` })
  } catch (error: any) {
    console.error('Product sync error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
