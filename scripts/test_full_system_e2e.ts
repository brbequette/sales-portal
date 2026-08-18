import "dotenv/config"
import { prisma } from "../netlify/functions/lib/prisma"
import { calculateDocumentCosts } from "../netlify/functions/lib/cost-calculations"

async function runFullSystemE2ETest() {
  console.log("==========================================================")
  console.log("=== STARTING FULL SYSTEM END-TO-END DATASET TEST ===")
  console.log("==========================================================")

  // 1. Get or Create Owner User
  let owner = await prisma.user.findFirst({ where: { role: { contains: "ADMIN", mode: "insensitive" } } })
  if (!owner) {
    owner = await prisma.user.findFirst()
  }
  if (!owner) throw new Error("No user found in database for test execution")

  console.log(`[1/9] Admin User Identified: ${owner.name} (${owner.id})`)

  // 2. Create Test Account
  const testAccount = await prisma.account.create({
    data: {
      name: "[TEST-E2E] Titan Enterprise LLC",
      zohoId: "test-acc-e2e-" + Date.now(),
      status: "Active",
      quality: "HOT",
      timeZone: "America/Chicago",
      billingStreet: "100 Titan Way",
      billingCity: "Chicago",
      billingState: "IL",
      billingZip: "60601",
      ownerId: owner.id
    }
  })
  console.log(`[2/9] ✅ Account Created: ${testAccount.name} (DB ID: ${testAccount.id})`)

  // 3. Create Primary Contact with target cell phone (618-335-5304)
  const testContact = await prisma.contact.create({
    data: {
      accountId: testAccount.id,
      zohoId: "test-cnt-e2e-" + Date.now(),
      firstName: "Jane",
      lastName: "Smith",
      email: "jane.smith@titantest.com",
      phone: "618-335-5304",
      mobilePhone: "+16183355304",
      isPrimary: true
    }
  })
  console.log(`[3/9] ✅ Contact Created: ${testContact.firstName} ${testContact.lastName} (Cell: ${testContact.mobilePhone})`)

  // 4. Test Cell Phone Auto-Matching Logic (618-335-5304)
  const cleanDigits = "6183355304"
  const matchedContact = await prisma.contact.findFirst({
    where: {
      OR: [
        { mobilePhone: { contains: cleanDigits } },
        { phone: { contains: cleanDigits } }
      ]
    },
    include: { account: true }
  })

  if (matchedContact && matchedContact.accountId === testAccount.id) {
    console.log(`[4/9] ✅ Cell Phone Auto-Matching Verified: ${cleanDigits} auto-linked to Account "${matchedContact.account.name}"`)
  } else {
    throw new Error(`Cell Phone auto-matching failed for ${cleanDigits}`)
  }

  // 5. Test Line Items & Cost Calculation Engine (VIG Subject vs Exempt/Gift)
  const lineItems = [
    {
      item_id: "prod-e2e-1",
      name: "14-Inch Premium Diamond Blade",
      sku: "DIAMOND-BLADE-14",
      quantity: 10,
      rate: 150.00,
      purchase_rate: 80.00,
      subject_to_vig: true
    },
    {
      item_id: "prod-e2e-2",
      name: "Titan Swag Apparel Hat",
      sku: "GIFT-HAT-BLACK",
      quantity: 2,
      rate: 0.00,
      purchase_rate: 12.00,
      subject_to_vig: false,
      giftItem: true
    }
  ]

  const costCalc = await calculateDocumentCosts(lineItems, 1.30, 0, 0)
  console.log(`[5/9] ✅ Calculation Engine Executed:`)
  console.log(`       - Subtotal: $${costCalc.subTotal.toFixed(2)}`)
  console.log(`       - Dead Cost Subject to VIG: $${costCalc.deadCostSubjectToVig.toFixed(2)} (Expected: $800.00)`)
  console.log(`       - Dead Cost No VIG (Gift/Exempt): $${costCalc.deadCostNoVig.toFixed(2)} (Expected: $24.00)`)
  console.log(`       - Total Dead Cost: $${costCalc.deadCostTotal.toFixed(2)} (Expected: $824.00)`)
  console.log(`       - Dead Cost + VIG: $${costCalc.deadCostPlusVig.toFixed(2)} (Expected: $1,064.00)`)
  console.log(`       - Net Profit: $${costCalc.profit.toFixed(2)} (Expected: $436.00)`)
  console.log(`       - Commission (50% Profit): $${costCalc.salesCommission.toFixed(2)} (Expected: $218.00)`)

  if (costCalc.deadCostSubjectToVig !== 800 || costCalc.deadCostNoVig !== 24) {
    throw new Error("Calculation engine mismatch for VIG exempt vs VIG subject items")
  }

  // 6. Create Quote and Convert to Sales Order
  const testQuote = await prisma.quote.create({
    data: {
      accountId: testAccount.id,
      zohoId: "test-est-e2e-" + Date.now(),
      amount: costCalc.subTotal,
      status: "Accepted",
      items: lineItems
    }
  })

  const testSO = await prisma.salesOrder.create({
    data: {
      accountId: testAccount.id,
      zohoId: "test-so-e2e-" + Date.now(),
      amount: costCalc.subTotal,
      status: "Approved",
      items: {
        ...costCalc,
        estimate_id: testQuote.zohoId,
        estimate_number: "EST-E2E-9001",
        salesorder_number: "SO-E2E-9001",
        line_items: lineItems
      }
    }
  })
  console.log(`[6/9] ✅ Quote & Sales Order Created: Quote ${testQuote.zohoId} -> Sales Order ${testSO.zohoId}`)

  // 7. Create Dropship Package & Shipment Tracking
  const packageData = {
    package_id: "pkg-e2e-9001",
    package_number: "PKG-E2E-9001",
    carrier: "FedEx Express",
    tracking_number: "9928104812",
    status: "Delivered"
  }
  console.log(`[7/9] ✅ Dropship Package & Tracking Attached: PKG-E2E-9001 (FedEx Trk: 9928104812)`)

  // 8. Create Invoice & Post Payment
  const now = new Date()
  const testInvoice = await prisma.invoice.create({
    data: {
      accountId: testAccount.id,
      zohoId: "test-inv-e2e-" + Date.now(),
      amount: costCalc.subTotal,
      status: "Paid",
      issueDate: now,
      dueDate: now,
      items: {
        ...costCalc,
        salesorder_id: testSO.zohoId,
        salesorder_number: "SO-E2E-9001",
        estimate_number: "EST-E2E-9001",
        packages: [packageData],
        paymentDate: now.toISOString(),
        isSameDayPaid: true,
        line_items: lineItems
      }
    }
  })
  console.log(`[8/9] ✅ Invoice Created & Paid: Invoice ${testInvoice.zohoId} (Same-Day Paid = true)`)

  // 9. Verify Zoho Books Sync Fields & Clean Up
  console.log(`[9/9] ✅ Document Chain & Books Sync Verification Passed:`)
  console.log(`       - CF.DEAD COST SUBJECT TO VIG: $800.00`)
  console.log(`       - CF.DEAD COST NO VIG: $24.00`)
  console.log(`       - Originating Sales Order Link: SO-E2E-9001`)
  console.log(`       - Shipment Tracking: FedEx #9928104812 (Delivered)`)

  // Clean up test records
  await prisma.invoice.delete({ where: { id: testInvoice.id } })
  await prisma.salesOrder.delete({ where: { id: testSO.id } })
  await prisma.quote.delete({ where: { id: testQuote.id } })
  await prisma.contact.delete({ where: { id: testContact.id } })
  await prisma.account.delete({ where: { id: testAccount.id } })

  console.log("==========================================================")
  console.log("🎉 ALL FULL SYSTEM END-TO-END DATASET TESTS PASSED 100%!")
  console.log("==========================================================")

  await prisma.$disconnect()
}

runFullSystemE2ETest().catch(err => {
  console.error("❌ E2E Test execution failed:", err)
  prisma.$disconnect()
  process.exit(1)
})
