import { prisma } from '../src/lib/prisma'
import { computePaymentMatchScore } from '../src/app/api/admin/orphans/suggest-matches/match-score'

async function runPaymentAutoMatch() {
  console.log("🚀 Evaluating 58 Unassociated Payments against Candidate Invoices...")
  const startTime = Date.now()

  const candidateInvoices = await prisma.invoice.findMany({
    orderBy: { issueDate: "desc" },
    include: {
      account: {
        select: {
          id: true,
          name: true,
          shippingStreet: true,
          shippingCity: true,
          shippingState: true,
          shippingZip: true
        }
      }
    }
  })
  console.log(`📦 Loaded ${candidateInvoices.length} candidate Invoices.`)

  const unassociatedPayments = await prisma.payment.findMany({
    where: { invoiceId: null },
    orderBy: { date: "desc" }
  })

  console.log(`🔍 Found ${unassociatedPayments.length} unassociated Payments.`)

  let totalLinked = 0
  const pendingUpdates: { paymentId: string; invoiceId: string; invoiceNumber: string; score: number; customer: string; reasons: string[] }[] = []

  const claimedInvoiceIds = new Set<string>()

  for (const p of unassociatedPayments) {
    let bestMatch: any = null
    let maxScore = 0
    let matchReasons: string[] = []

    for (const inv of candidateInvoices) {
      if (claimedInvoiceIds.has(inv.id)) continue

      const { score, reasons } = computePaymentMatchScore(p, inv)
      if (score > maxScore) {
        maxScore = score
        bestMatch = inv
        matchReasons = reasons
      }
    }

    if (bestMatch && maxScore >= 70) {
      const invData = (bestMatch.items as any) || {}
      const finalDocNum = bestMatch.invoiceNumber || invData.invoiceNumber || bestMatch.zohoId

      console.log(`🎯 Payment #${p.zohoId} (${p.description} - $${p.amount}) → Match: Inv #${finalDocNum} (${bestMatch.account?.name || invData.customer_name}) | Score: ${maxScore}% | Reasons: ${matchReasons.join(", ")}`)

      pendingUpdates.push({
        paymentId: p.id,
        invoiceId: bestMatch.zohoId,
        invoiceNumber: String(finalDocNum),
        score: maxScore,
        customer: bestMatch.account?.name || invData.customer_name || p.description || "Customer",
        reasons: matchReasons
      })

      if (maxScore >= 85) {
        totalLinked++
        claimedInvoiceIds.add(bestMatch.id)
      }
    } else {
      console.log(`❓ Payment #${p.zohoId} (${p.description} - $${p.amount}) → Best Match Score: ${maxScore}% ${bestMatch ? `(${bestMatch.account?.name})` : 'No Match'}`)
    }
  }

  if (pendingUpdates.length > 0) {
    console.log(`💾 Auto-linking ${totalLinked} high-confidence payment matches (>=85% score)...`)
    for (const u of pendingUpdates) {
      if (u.score >= 85) {
        await prisma.payment.update({
          where: { id: u.paymentId },
          data: {
            invoiceId: u.invoiceId,
            invoiceNumber: u.invoiceNumber
          }
        })
      }
    }
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`\n==================================================`)
  console.log(`✨ PAYMENT AUTO-MATCH COMPLETE in ${durationSec}s`)
  console.log(`==================================================`)
  console.log(`📊 Scanned Payments:     ${unassociatedPayments.length}`)
  console.log(`✅ Auto-Matched & Linked:${totalLinked} Payments (>= 85% score)`)
  console.log(`📌 Suggestions Ready:    ${pendingUpdates.length} Payments with candidate matches`)
  console.log(`==================================================\n`)

  await prisma.$disconnect()
}

runPaymentAutoMatch().catch(async (e) => {
  console.error("❌ Payment auto-match error:", e)
  await prisma.$disconnect()
  process.exit(1)
})
