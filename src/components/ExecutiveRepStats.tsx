"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { FiAlertCircle, FiFileText, FiRefreshCw, FiShoppingCart, FiTrendingUp, FiUsers } from "react-icons/fi"

type Totals = { invoiceCount:number; invoiceSubtotal:number; invoiceDeadProfit:number; invoiceNetProfit:number; invoiceCommission:number; salesOrderCount:number; salesOrderSubtotal:number; salesOrderDeadProfit:number; salesOrderEstCommission:number }
type Rep = { repId:string; repName:string; email?:string; revenue:number; deadProfit:number; profit:number; commissions:number; invoiceCount:number; salesOrderCount:number }
type Snapshot = { totals: Totals; reps: Rep[] }
type PeriodKey = "today" | "this_week" | "this_month" | "this_year"

const PERIODS: { key: PeriodKey; label: string; short: string }[] = [
  { key:"today", label:"Today", short:"Daily" }, { key:"this_week", label:"This Week", short:"Weekly" },
  { key:"this_month", label:"Month to Date", short:"Monthly" }, { key:"this_year", label:"Year to Date", short:"YTD" },
]
const ZERO: Totals = { invoiceCount:0, invoiceSubtotal:0, invoiceDeadProfit:0, invoiceNetProfit:0, invoiceCommission:0, salesOrderCount:0, salesOrderSubtotal:0, salesOrderDeadProfit:0, salesOrderEstCommission:0 }
const money = (v:number) => new Intl.NumberFormat("en-US", { style:"currency", currency:"USD", maximumFractionDigits:0 }).format(Number(v)||0)
const percent = (v:number) => `${Number.isFinite(v) ? v.toFixed(1) : "0.0"}%`

function Metric({ label, value, note, color="text-white" }:{ label:string; value:string; note?:string; color?:string }) {
  return <div className="min-w-0 rounded-xl border border-white/10 bg-black/30 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{label}</p><p className={`mt-1 truncate text-lg font-black ${color}`}>{value}</p>{note&&<p className="mt-0.5 truncate text-[10px] text-neutral-500">{note}</p>}</div>
}

export function ExecutiveRepStats({ repId, repName, repEmail }:{ repId?:string|null; repName?:string|null; repEmail?:string|null }) {
  const [snapshots,setSnapshots] = useState<Partial<Record<PeriodKey,Snapshot>>>({})
  const [loading,setLoading] = useState(true)
  const [error,setError] = useState("")
  const [updatedAt,setUpdatedAt] = useState<Date|null>(null)
  const scope = repId || repEmail || repName || "all"

  const load = useCallback(async () => {
    setLoading(true); setError("")
    try {
      const results = await Promise.all(PERIODS.map(async ({key}) => {
        const response = await fetch(`/api/get-rep-stats?${new URLSearchParams({repId:scope,period:key})}`, {cache:"no-store"})
        const body = await response.json().catch(()=>({}))
        if (!response.ok || !body.success) throw new Error(body.error || `Unable to load ${key} statistics`)
        return [key,{totals:body.totals||ZERO,reps:body.reps||[]}] as const
      }))
      setSnapshots(Object.fromEntries(results)); setUpdatedAt(new Date())
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load executive statistics") }
    finally { setLoading(false) }
  },[scope])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- load is the external API synchronization boundary
  useEffect(()=>{ load() },[load])

  const repRows = useMemo(() => {
    const ids = new Set<string>()
    PERIODS.forEach(({key})=>snapshots[key]?.reps.forEach(rep=>ids.add(rep.repId)))
    return Array.from(ids).map(id=>{
      const byPeriod = Object.fromEntries(PERIODS.map(({key})=>[key,snapshots[key]?.reps.find(r=>r.repId===id)])) as Record<PeriodKey,Rep|undefined>
      const identity = byPeriod.this_year||byPeriod.this_month||byPeriod.this_week||byPeriod.today
      return {id,name:identity?.repName||"Unassigned",email:identity?.email||"",byPeriod}
    }).filter(row=>PERIODS.some(({key})=>(row.byPeriod[key]?.invoiceCount||0)+(row.byPeriod[key]?.salesOrderCount||0)>0))
      .sort((a,b)=>(b.byPeriod.this_year?.revenue||0)-(a.byPeriod.this_year?.revenue||0))
  },[snapshots])

  if (loading && !Object.keys(snapshots).length) return <div className="flex min-h-[420px] items-center justify-center text-sm text-neutral-400"><FiRefreshCw className="mr-2 animate-spin"/>Loading real invoice and commission data…</div>
  if (error && !Object.keys(snapshots).length) return <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/5 text-center"><FiAlertCircle className="text-red-400" size={26}/><div><p className="font-bold text-white">Executive statistics failed to load</p><p className="text-xs text-neutral-400">{error}</p></div><button onClick={load} className="rounded-lg bg-red-500 px-4 py-2 text-xs font-bold text-white">Retry</button></div>

  const month=snapshots.this_month?.totals||ZERO, year=snapshots.this_year?.totals||ZERO
  const monthMargin=month.invoiceSubtotal?month.invoiceDeadProfit/month.invoiceSubtotal*100:0
  const avgInvoice=month.invoiceCount?month.invoiceSubtotal/month.invoiceCount:0

  return <div className="space-y-5 animate-fade-in">
    <div className="flex flex-col gap-3 rounded-2xl border border-orange-500/20 bg-gradient-to-r from-orange-500/10 to-transparent p-4 md:flex-row md:items-center md:justify-between">
      <div><p className="text-xs font-bold uppercase tracking-widest text-orange-400">{scope==="all"?"Company Performance":repName||repEmail}</p><h3 className="text-xl font-black text-white">Live sales and earnings scorecard</h3><p className="text-xs text-neutral-400">Authoritative invoices, calculated profit, commissions, and uninvoiced sales orders.</p></div>
      <div className="flex items-center gap-3">{updatedAt&&<span className="text-[10px] text-neutral-500">Updated {updatedAt.toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}</span>}<button onClick={load} disabled={loading} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white hover:bg-white/10 disabled:opacity-50"><FiRefreshCw className={loading?"animate-spin":""}/>Refresh</button></div>
    </div>
    {error&&<div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-2 text-xs text-amber-300">Refresh warning: {error}. Showing the last successful data.</div>}

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <Metric label="MTD Subtotal" value={money(month.invoiceSubtotal)} note={`${month.invoiceCount} billed invoices`}/><Metric label="MTD Dead Profit" value={money(month.invoiceDeadProfit)} note={`${percent(monthMargin)} gross margin`} color="text-emerald-400"/><Metric label="MTD Net Profit" value={money(month.invoiceNetProfit)} note="After VIG" color="text-emerald-300"/><Metric label="MTD Commission" value={money(month.invoiceCommission)} note="Earned + eligible upfront" color="text-amber-400"/><Metric label="Average Invoice" value={money(avgInvoice)} note={`${repRows.length} active reps`} color="text-sky-400"/>
    </div>

    <div className="overflow-hidden rounded-2xl border border-white/10 bg-neutral-900/60">
      <div className="border-b border-white/10 p-4"><h3 className="flex items-center gap-2 font-black text-white"><FiTrendingUp className="text-orange-400"/>Daily, Weekly, Monthly &amp; YTD Totals</h3></div>
      <div className="grid grid-cols-1 divide-y divide-white/10 md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-4">
        {PERIODS.map(({key,label})=>{const t=snapshots[key]?.totals||ZERO,margin=t.invoiceSubtotal?t.invoiceDeadProfit/t.invoiceSubtotal*100:0;return <div key={key} className="space-y-3 p-4"><div className="flex items-center justify-between"><h4 className="font-black text-white">{label}</h4><span className="rounded-full bg-white/5 px-2 py-1 text-[9px] uppercase text-neutral-500">{t.invoiceCount} invoices</span></div><Metric label="Billed Subtotal" value={money(t.invoiceSubtotal)}/><Metric label="Dead Profit" value={money(t.invoiceDeadProfit)} note={`${percent(margin)} margin`} color="text-emerald-400"/><Metric label="Net Profit" value={money(t.invoiceNetProfit)} note="After VIG" color="text-emerald-300"/><Metric label="Commission" value={money(t.invoiceCommission)} color="text-amber-400"/><Metric label="Average Invoice" value={money(t.invoiceCount?t.invoiceSubtotal/t.invoiceCount:0)}/></div>})}
      </div>
    </div>

    <div className="grid gap-4 lg:grid-cols-3">
      <div className="rounded-2xl border border-purple-500/20 bg-purple-500/5 p-4 lg:col-span-2"><h3 className="mb-3 flex items-center gap-2 font-black text-white"><FiShoppingCart className="text-purple-400"/>Uninvoiced Sales-Order Pipeline</h3><div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Metric label="YTD Pipeline" value={money(year.salesOrderSubtotal)} note={`${year.salesOrderCount} orders`}/><Metric label="Pipeline Dead Profit" value={money(year.salesOrderDeadProfit)} color="text-purple-300"/><Metric label="Est. Commission" value={money(year.salesOrderEstCommission)} color="text-purple-300"/><Metric label="Avg. Order" value={money(year.salesOrderCount?year.salesOrderSubtotal/year.salesOrderCount:0)}/></div></div>
      <div className="rounded-2xl border border-white/10 bg-neutral-900/60 p-4"><h3 className="mb-3 font-black text-white">YTD Economics</h3><div className="space-y-2 text-xs"><div className="flex justify-between"><span className="text-neutral-400">Dead-profit margin</span><b className="text-emerald-400">{percent(year.invoiceSubtotal?year.invoiceDeadProfit/year.invoiceSubtotal*100:0)}</b></div><div className="flex justify-between"><span className="text-neutral-400">Net-profit margin</span><b className="text-emerald-300">{percent(year.invoiceSubtotal?year.invoiceNetProfit/year.invoiceSubtotal*100:0)}</b></div><div className="flex justify-between"><span className="text-neutral-400">Commission / subtotal</span><b className="text-amber-400">{percent(year.invoiceSubtotal?year.invoiceCommission/year.invoiceSubtotal*100:0)}</b></div><div className="flex justify-between"><span className="text-neutral-400">Average billed invoice</span><b className="text-white">{money(year.invoiceCount?year.invoiceSubtotal/year.invoiceCount:0)}</b></div></div></div>
    </div>

    <div className="overflow-hidden rounded-2xl border border-white/10 bg-neutral-900/60">
      <div className="flex items-center justify-between border-b border-white/10 p-4"><h3 className="flex items-center gap-2 font-black text-white"><FiUsers className="text-sky-400"/>Rep Leaderboard &amp; Period Comparison</h3><span className="text-[10px] text-neutral-500">Ranked by YTD subtotal</span></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-left text-xs"><thead className="bg-black/30 text-[9px] uppercase tracking-wider text-neutral-500"><tr><th className="p-3">Rank / Rep</th>{PERIODS.map(p=><th key={p.key} className="p-3 text-right">{p.short} Subtotal</th>)}<th className="p-3 text-right">YTD Dead Profit</th><th className="p-3 text-right">YTD Net Profit</th><th className="p-3 text-right">YTD Commission</th><th className="p-3 text-right">Invoices</th><th className="p-3 text-right">Margin</th></tr></thead>
      <tbody className="divide-y divide-white/5">{repRows.length===0?<tr><td colSpan={10} className="p-8 text-center text-neutral-500">No qualifying real invoice or sales-order activity exists for this scope.</td></tr>:repRows.map((row,index)=>{const y=row.byPeriod.this_year,margin=y?.revenue?(y.deadProfit||0)/y.revenue*100:0;return <tr key={row.id} className="hover:bg-white/[0.03]"><td className="p-3"><div className="flex items-center gap-3"><span className={`flex h-7 w-7 items-center justify-center rounded-full font-black ${index<3?"bg-orange-500/20 text-orange-400":"bg-white/5 text-neutral-500"}`}>{index+1}</span><div><p className="font-bold text-white">{row.name}</p><p className="text-[9px] text-neutral-600">{row.email}</p></div></div></td>{PERIODS.map(({key})=><td key={key} className="p-3 text-right font-mono font-bold text-white">{money(row.byPeriod[key]?.revenue||0)}</td>)}<td className="p-3 text-right font-mono font-bold text-emerald-400">{money(y?.deadProfit||0)}</td><td className="p-3 text-right font-mono font-bold text-emerald-300">{money(y?.profit||0)}</td><td className="p-3 text-right font-mono font-bold text-amber-400">{money(y?.commissions||0)}</td><td className="p-3 text-right font-bold text-sky-400">{y?.invoiceCount||0}</td><td className="p-3 text-right font-bold text-emerald-400">{percent(margin)}</td></tr>})}</tbody></table></div>
    </div>
    <div className="flex items-center gap-2 text-[10px] text-neutral-600"><FiFileText/>Invoice totals exclude void and draft documents. Profit and commissions use stored computed values and established fallback rules.</div>
  </div>
}
