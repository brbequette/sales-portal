export type ScriptInvoice = {
  id: string
  invoice_number: string
  customer_name: string
  balance: number
  due_date: string | null
  days_overdue: number
  customer_contacts?: { name: string; isPrimary?: boolean }[]
}

const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
const spokenName = (value: string) => value === value.toUpperCase()
  ? value.toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase()) : value

export function buildCollectionsScript(invoices: ScriptInvoice[], callerName: string) {
  if (!invoices.length) return null
  const oldest = [...invoices].sort((a, b) => b.days_overdue - a.days_overdue)[0]
  const days = Math.max(0, oldest.days_overdue || 0)
  const total = invoices.reduce((sum, invoice) => sum + invoice.balance, 0)
  const contact = invoices.flatMap(invoice => invoice.customer_contacts || []).find(contact => contact.isPrimary)
  const name = callerName.trim() ? spokenName(callerName.trim()) : '[your name]'
  const stage = days > 90 ? '91+ days · Final demand' : days >= 60 ? '60–90 days · Urgent resolution'
    : days >= 45 ? '45–59 days · Escalation' : days >= 30 ? '30–44 days · Firm follow-up'
    : days >= 15 ? '15–29 days · Payment commitment' : days > 0 ? '1–14 days · Friendly reminder' : 'Due-date review'
  const request = days > 90
    ? `This is a final request for payment of ${money(total)} on these invoices. We need to resolve this balance now. Can you arrange payment today? If you cannot, please give me a specific payment amount and date today so I can submit your proposal for approval. If we cannot agree on a resolution, the account may be referred for management review of available civil recovery options.`
    : days >= 60
      ? `This balance needs urgent attention. Can you pay ${money(total)} today? If full payment is not possible, what amount can you pay now, and on what exact date can you pay the remainder? I can submit that proposal for review, but I cannot promise it will be accepted.`
      : days >= 45
        ? `We need a clear resolution for this past-due balance. Please confirm today whether you can pay ${money(total)} or provide a specific payment proposal. If something is disputed, tell me which invoice and why so we can get it reviewed. I need a concrete next step to take back to our collections manager.`
        : days >= 30
          ? `These invoices need to be brought current. Can you arrange payment of ${money(total)} today? If not, what is the exact date and amount you can commit to? If there is a billing issue holding this up, let's identify it now rather than leave the balance unresolved.`
          : days >= 15
            ? `I'd like to get a firm payment date for this balance. Can you arrange ${money(total)} today, or tell me the exact date payment will be made? Is there an approval or invoice question we can help clear up?`
            : days > 0
              ? `I wanted to make sure the invoice reached the right person and check whether anything is holding up payment. Can you take care of ${money(total)} today, or let me know when it is scheduled? I'm happy to help with an invoice copy or a billing question.`
              : `I'd like to confirm the due date and payment status before discussing any overdue escalation. Can you help me check these invoices?`
  const intro = `Hi${contact?.name ? ` ${spokenName(contact.name)}` : ''}, this is ${name} with Titan Diamond. Am I speaking with the person who handles payments for ${spokenName(oldest.customer_name)}?`
  const summary = `I'm calling about ${invoices.length === 1 ? `invoice #${oldest.invoice_number}` : `${invoices.length} selected invoices`} for ${spokenName(oldest.customer_name)}, with ${money(total)} remaining. ${days > 0 ? `The oldest selected invoice is #${oldest.invoice_number}${oldest.due_date ? `, due ${oldest.due_date}` : ''}, now ${days} days overdue.` : 'The overdue age needs to be confirmed.'}`
  return {
    stage, days, total,
    paragraphs: [intro, summary, request, `If you've already paid, please share the payment date, amount, and reference so we can reconcile it. Before we finish, let me repeat the next step and date we agreed on. Thank you for working through this with me.`],
    voicemail: `Hi, this is ${name} with Titan Diamond calling for ${spokenName(oldest.customer_name)}. Please return my call using our usual company contact number. Thank you.`,
    legalReview: days > 90 ? 'Internal only — not part of the call script: Nonpayment or invoice age alone does not establish a crime. If there is separate documented evidence of fraud, a knowingly bad check, or other suspected criminal conduct, preserve the evidence and ask counsel to assess the facts and applicable jurisdiction. Do not accuse the customer, threaten arrest or prosecution, or offer to withhold reporting in exchange for payment. Verify the balance, disputes, prior notices and approved next steps before issuing a formal written demand.' : null,
  }
}
