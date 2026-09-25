import { notFound } from 'next/navigation'
import { checkAccountOwnership } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { getDealPackage } from '@/lib/deal-package'

export const dynamic = 'force-dynamic'
const money = (value: number | null) => value === null ? 'Unknown' : value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
function Records({ title, rows }: { title: string; rows: unknown[] }) {
  return <details className="rounded-xl border border-white/10 bg-white/[0.025] p-5"><summary className="cursor-pointer font-semibold">{title} <span className="text-neutral-500">({rows.length})</span></summary>
    {!rows.length ? <p className="mt-3 text-neutral-400">No linked records available.</p> : <div className="mt-4 space-y-3">{rows.map((row: any, index) => <details key={row.id || index} className="rounded-lg bg-black/20 p-3"><summary className="cursor-pointer text-sm">{row.invoiceNumber || row.packageNumber || row.name || row.subject || row.title || row.zohoId || `${title} ${index + 1}`} {row.status ? `· ${row.status}` : ''}</summary><pre className="mt-3 max-h-[32rem] overflow-auto whitespace-pre-wrap break-words text-xs text-neutral-300">{JSON.stringify(row, null, 2)}</pre></details>)}</div>}
  </details>
}
export default async function DealPackagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const deal = await prisma.deal.findUnique({ where: { id }, select: { accountId: true } })
  if (!deal) notFound()
  const auth = await checkAccountOwnership(deal.accountId)
  if (!auth.authorized) return <main className="p-8">Sign in with access to this account to view its deal package.</main>
  const pkg = await getDealPackage(id)
  if (pkg.account.id !== deal.accountId || (!auth.isAdmin && pkg.account.ownerId !== auth.user?.dbId)) return <main className="p-8">Account access changed. Reload the record.</main>
  return <main className="mx-auto max-w-6xl space-y-6 p-6 text-neutral-100">
    <div><p className="text-sm text-emerald-400">Complete deal package</p><h1 className="mt-1 text-3xl font-bold">{pkg.deal.name}</h1><p className="mt-2 text-neutral-400">{pkg.account.name} · {pkg.deal.owner.name} · {pkg.lifecycle.disposition}</p></div>
    <div className="flex flex-wrap gap-4 text-sm"><a className="text-emerald-400 underline" href={`/api/deals/${id}/package?download=1`}>Download complete package</a>{pkg.deal.crmId && <a className="text-emerald-400 underline" href={`https://crm.zoho.com/crm/tab/Potentials/${pkg.deal.crmId}`} target="_blank" rel="noreferrer">Open Zoho CRM deal</a>}</div>
    <div className="grid gap-4 sm:grid-cols-3">{[['Invoice amount', pkg.financials.invoiceAmount], ['Outstanding balance', pkg.financials.balance], ['Calculated profit', pkg.financials.profit]].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-white/10 p-5"><p className="text-sm text-neutral-400">{label}</p><p className="mt-1 text-2xl font-bold">{money(value as number | null)}</p></div>)}</div>
    <div className="rounded-xl border border-white/10 p-5"><h2 className="font-semibold">Disposition and synchronization</h2><p className="mt-2">{pkg.lifecycle.disposition} · CRM sync: {pkg.sync.state}</p><p className="mt-2 text-sm text-neutral-400">{pkg.lifecycle.fulfillment}. {pkg.lifecycle.completion}.</p>{pkg.sync.syncedAt && <p className="mt-2 text-sm">Last verified: {pkg.sync.syncedAt}</p>}</div>
    {!!pkg.unknowns.length && <div className="rounded-xl border border-amber-400/30 p-5"><h2 className="font-semibold text-amber-300">Needs attention</h2><ul className="mt-2 list-inside list-disc text-sm">{pkg.unknowns.map(value => <li key={value}>{value}</li>)}</ul></div>}
    <Records title="Customer and contacts" rows={[pkg.account]} />
    <Records title="Invoices, products, payments and commissions" rows={pkg.invoices} />
    <Records title="Quotes" rows={pkg.quotes} /><Records title="Sales orders" rows={pkg.salesOrders} />
    <Records title="Purchase orders" rows={pkg.purchaseOrders} /><Records title="Packages and tracking" rows={pkg.packages} />
    <Records title="Tasks" rows={pkg.tasks} /><Records title="Deal history" rows={pkg.history} />
    <Records title="Closing checklists and evidence" rows={pkg.checklists} />
    <h2 className="pt-3 text-xl font-semibold">Account activity</h2><p className="text-sm text-neutral-400">{pkg.accountContext.scope}</p>
    <Records title="Notes" rows={pkg.accountContext.notes} /><Records title="Calls and transcripts" rows={pkg.accountContext.calls} /><Records title="Messages" rows={pkg.accountContext.messages} />
    <Records title="CRM fields" rows={[pkg.deal.crmFields]} />
    <Records title="Zoho deal notes" rows={pkg.crmNotes} />
  </main>
}
