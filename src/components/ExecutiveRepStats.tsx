"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { FiAlertCircle, FiFileText, FiRefreshCw, FiShoppingCart, FiTrendingUp, FiUsers } from "react-icons/fi"
import { MetricDerivationModal, type MetricDerivationInfo } from "@/components/MetricDerivationModal"

type Totals = { invoiceCount:number; invoiceSubtotal:number; invoiceDeadProfit:number; invoiceNetProfit:number; invoiceCommission:number; salesOrderCount:number; salesOrderSubtotal:number; salesOrderDeadProfit:number; salesOrderEstCommission:number; mtdSales?:number; mtdProfit?:number; mtdCommission?:number; qualityBlockedCount?:number }
type FinancialDocument = { id:string; invoiceNumber?:string; salesOrderNumber?:string; date?:string; customerName?:string; subtotal:number; deadProfit?:number; profit?:number; commission?:number; estCommission?:number; costQuality?:string }
type Rep = { repId:string; repName:string; email?:string; revenue:number; deadProfit:number; profit:number; commissions:number; invoiceCount:number; salesOrderCount:number; invoices?:FinancialDocument[]; salesOrders?:FinancialDocument[] }
type Snapshot = { totals: Totals; reps: Rep[] }
type PeriodKey = "today" | "this_week" | "this_month" | "this_year"

const PERIODS: { key: PeriodKey; label: string; short: string }[] = [
  { key:"today", label:"Today", short:"Daily" }, { key:"this_week", label:"This Week", short:"Weekly" },
  { key:"this_month", label:"Month to Date", short:"Monthly" }, { key:"this_year", label:"Year to Date", short:"YTD" },
]
const ZERO: Totals = { invoiceCount:0, invoiceSubtotal:0, invoiceDeadProfit:0, invoiceNetProfit:0, invoiceCommission:0, salesOrderCount:0, salesOrderSubtotal:0, salesOrderDeadProfit:0, salesOrderEstCommission:0 }
const money = (v:number) => new Intl.NumberFormat("en-US", { style:"currency", currency:"USD", minimumFractionDigits:2, maximumFractionDigits:2 }).format(Number(v)||0)
const percent = (v:number) => `${Number.isFinite(v) ? v.toFixed(1) : "0.0"}%`

function Metric({ label, value, note, color="text-white", onClick }:{ label:string; value:string; note?:string; color?:string; onClick?:()=>void }) {
  return <button type="button" onClick={onClick} className="min-w-0 rounded-xl border border-white/10 bg-black/30 p-3 text-left transition hover:border-orange-400/50 hover:bg-white/[0.04]"><p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{label}</p><p className={`mt-1 truncate text-lg font-black ${color}`}>{value}</p>{note&&<p className="mt-0.5 truncate text-[10px] text-neutral-500">{note}</p>}</button>
}

export function ExecutiveRepStats({ repId, repName, repEmail }:{ repId?:string|null; repName?:string|null; repEmail?:string|null }) {
  const [snapshots,setSnapshots] = useState<Partial<Record<PeriodKey,Snapshot>>>({})
  const [loading,setLoading] = useState(true)
  const [error,setError] = useState("")
  const [updatedAt,setUpdatedAt] = useState<Date|null>(null)
  const [metricInfo,setMetricInfo] = useState<MetricDerivationInfo|null>(null)
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
    } catch (reason) {
      setSnapshots({})
      setError(reason instanceof Error ? reason.message : "Unable to load executive statistics")
    }
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
  const monthSales=month.mtdSales ?? month.invoiceSubtotal+month.salesOrderSubtotal
  const monthDeadProfit=month.invoiceDeadProfit+month.salesOrderDeadProfit
  const monthProfit=month.mtdProfit ?? month.invoiceNetProfit
  const monthCommission=month.mtdCommission ?? month.invoiceCommission+month.salesOrderEstCommission
  const monthCount=month.invoiceCount+month.salesOrderCount
  const monthMargin=monthSales?monthDeadProfit/monthSales*100:0
  const avgInvoice=monthCount?monthSales/monthCount:0
  const periodDocs=(key:PeriodKey)=>snapshots[key]?.reps.flatMap(rep=>[...(rep.invoices||[]),...(rep.salesOrders||[])])||[]
  const openMetric=(title:string,value:number,docs:FinancialDocument[],field:"subtotal"|"deadProfit"|"profit"|"commission")=>setMetricInfo({
    title,value:money(value),formula:`${title} = sum of authoritative stored ${field} values for the listed eligible documents`,
    explanation:"Includes active invoices and eligible uninvoiced sales orders in the selected company-local period. Converted, linked, terminal, unresolved, and missing-cost financial contributions are excluded or blocked.",
    dataSource:"Local PostgreSQL document snapshots produced by the authoritative cost processor",calculationDetails:[{label:"Eligible documents",value:docs.length},{label:"Total",value:money(value)}],documents:docs.map(doc=>({...doc,amount:field==="commission"?(doc.commission??doc.estCommission??0):(doc[field]??0)})),
  })

  return <div className="space-y-5 animate-fade-in">
    <div className="flex flex-col gap-3 rounded-2xl border border-orange-500/20 bg-gradient-to-r from-orange-500/10 to-transparent p-4 md:flex-row md:items-center md:justify-between">
      <div><p className="text-xs font-bold uppercase tracking-widest text-orange-400">{scope==="all"?"Company Performance":repName||repEmail}</p><h3 className="text-xl font-black text-white">Live sales and earnings scorecard</h3><p className="text-xs text-neutral-400">Authoritative invoices, calculated profit, commissions, and uninvoiced sales orders.</p></div>
      <div className="flex items-center gap-3">{updatedAt&&<span className="text-[10px] text-neutral-500">Updated {updatedAt.toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}</span>}<button onClick={load} disabled={loading} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white hover:bg-white/10 disabled:opacity-50"><FiRefreshCw className={loading?"animate-spin":""}/>Refresh</button></div>
    </div>

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <Metric label="MTD Sales" value={money(monthSales)} note={`${month.invoiceCount} invoices + ${month.salesOrderCount} uninvoiced orders`} onClick={()=>openMetric("MTD Sales",monthSales,periodDocs("this_month"),"subtotal")}/><Metric label="MTD Dead Profit" value={money(monthDeadProfit)} note={`${percent(monthMargin)} gross margin`} color="text-emerald-400" onClick={()=>openMetric("MTD Dead Profit",monthDeadProfit,periodDocs("this_month"),"deadProfit")}/><Metric label="MTD Net Profit" value={money(monthProfit)} note="After VIG" color="text-emerald-300" onClick={()=>openMetric("MTD Net Profit",monthProfit,periodDocs("this_month"),"profit")}/><Metric label="MTD Commission" value={money(monthCommission)} note="Canonical planned commission" color="text-amber-400" onClick={()=>openMetric("MTD Commission",monthCommission,periodDocs("this_month"),"commission")}/><Metric label="Average Sale" value={money(avgInvoice)} note={`${monthCount} documents`} color="text-sky-400" onClick={()=>openMetric("Average MTD Sale",avgInvoice,periodDocs("this_month"),"subtotal")}/>
    </div>

    <div className="overflow-hidden rounded-2xl border border-white/10 bg-neutral-900/60">
      <div className="border-b border-white/10 p-4"><h3 className="flex items-center gap-2 font-black text-white"><FiTrendingUp className="text-orange-400"/>Daily, Weekly, Monthly &amp; YTD Totals</h3></div>
      <div className="grid grid-cols-1 divide-y divide-white/10 md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-4">
        {PERIODS.map(({key,label})=>{const t=snapshots[key]?.totals||ZERO,docs=periodDocs(key),sales=t.mtdSales??t.invoiceSubtotal+t.salesOrderSubtotal,dead=t.invoiceDeadProfit+t.salesOrderDeadProfit,profit=t.mtdProfit??t.invoiceNetProfit,commission=t.mtdCommission??t.invoiceCommission+t.salesOrderEstCommission,count=t.invoiceCount+t.salesOrderCount,margin=sales?dead/sales*100:0;return <div key={key} className="space-y-3 p-4"><div className="flex items-center justify-between"><h4 className="font-black text-white">{label}</h4><span className="rounded-full bg-white/5 px-2 py-1 text-[9px] uppercase text-neutral-500">{count} documents</span></div><Metric label="Sales" value={money(sales)} onClick={()=>openMetric(`${label} Sales`,sales,docs,"subtotal")}/><Metric label="Dead Profit" value={money(dead)} note={`${percent(margin)} margin`} color="text-emerald-400" onClick={()=>openMetric(`${label} Dead Profit`,dead,docs,"deadProfit")}/><Metric label="Net Profit" value={money(profit)} note="After VIG" color="text-emerald-300" onClick={()=>openMetric(`${label} Net Profit`,profit,docs,"profit")}/><Metric label="Commission" value={money(commission)} color="text-amber-400" onClick={()=>openMetric(`${label} Commission`,commission,docs,"commission")}/><Metric label="Average Sale" value={money(count?sales/count:0)} onClick={()=>openMetric(`${label} Average Sale`,count?sales/count:0,docs,"subtotal")}/></div>})}
      </div>
    </div>

    <div className="grid gap-4 lg:grid-cols-3">
      <div className="rounded-2xl border border-purple-500/20 bg-purple-500/5 p-4 lg:col-span-2"><h3 className="mb-3 flex items-center gap-2 font-black text-white"><FiShoppingCart className="text-purple-400"/>Uninvoiced Sales-Order Pipeline</h3><div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Metric label="YTD Pipeline" value={money(year.salesOrderSubtotal)} note={`${year.salesOrderCount} orders`} onClick={()=>openMetric("YTD Uninvoiced Sales Orders",year.salesOrderSubtotal,periodDocs("this_year").filter(doc=>doc.salesOrderNumber),"subtotal")}/><Metric label="Pipeline Dead Profit" value={money(year.salesOrderDeadProfit)} color="text-purple-300" onClick={()=>openMetric("YTD Pipeline Dead Profit",year.salesOrderDeadProfit,periodDocs("this_year").filter(doc=>doc.salesOrderNumber),"deadProfit")}/><Metric label="Est. Commission" value={money(year.salesOrderEstCommission)} color="text-purple-300" onClick={()=>openMetric("YTD Pipeline Commission",year.salesOrderEstCommission,periodDocs("this_year").filter(doc=>doc.salesOrderNumber),"commission")}/><Metric label="Avg. Order" value={money(year.salesOrderCount?year.salesOrderSubtotal/year.salesOrderCount:0)} onClick={()=>openMetric("Average YTD Uninvoiced Order",year.salesOrderCount?year.salesOrderSubtotal/year.salesOrderCount:0,periodDocs("this_year").filter(doc=>doc.salesOrderNumber),"subtotal")}/></div></div>
      <div className="rounded-2xl border border-white/10 bg-neutral-900/60 p-4"><h3 className="mb-3 font-black text-white">YTD Economics</h3><div className="space-y-2 text-xs"><div className="flex justify-between"><span className="text-neutral-400">Dead-profit margin</span><b className="text-emerald-400">{percent(year.invoiceSubtotal?year.invoiceDeadProfit/year.invoiceSubtotal*100:0)}</b></div><div className="flex justify-between"><span className="text-neutral-400">Net-profit margin</span><b className="text-emerald-300">{percent(year.invoiceSubtotal?year.invoiceNetProfit/year.invoiceSubtotal*100:0)}</b></div><div className="flex justify-between"><span className="text-neutral-400">Commission / subtotal</span><b className="text-amber-400">{percent(year.invoiceSubtotal?year.invoiceCommission/year.invoiceSubtotal*100:0)}</b></div><div className="flex justify-between"><span className="text-neutral-400">Average billed invoice</span><b className="text-white">{money(year.invoiceCount?year.invoiceSubtotal/year.invoiceCount:0)}</b></div></div></div>
    </div>

    <div className="overflow-hidden rounded-2xl border border-white/10 bg-neutral-900/60">
      <div className="flex items-center justify-between border-b border-white/10 p-4"><h3 className="flex items-center gap-2 font-black text-white"><FiUsers className="text-sky-400"/>Rep Leaderboard &amp; Period Comparison</h3><span className="text-[10px] text-neutral-500">Ranked by YTD subtotal</span></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-left text-xs"><thead className="bg-black/30 text-[9px] uppercase tracking-wider text-neutral-500"><tr><th className="p-3">Rank / Rep</th>{PERIODS.map(p=><th key={p.key} className="p-3 text-right">{p.short} Subtotal</th>)}<th className="p-3 text-right">YTD Dead Profit</th><th className="p-3 text-right">YTD Net Profit</th><th className="p-3 text-right">YTD Commission</th><th className="p-3 text-right">Invoices</th><th className="p-3 text-right">Margin</th></tr></thead>
      <tbody className="divide-y divide-white/5">{repRows.length===0?<tr><td colSpan={10} className="p-8 text-center text-neutral-500">No qualifying real invoice or sales-order activity exists for this scope.</td></tr>:repRows.map((row,index)=>{const y=row.byPeriod.this_year,margin=y?.revenue?(y.deadProfit||0)/y.revenue*100:0;return <tr key={row.id} className="hover:bg-white/[0.03]"><td className="p-3"><div className="flex items-center gap-3"><span className={`flex h-7 w-7 items-center justify-center rounded-full font-black ${index<3?"bg-orange-500/20 text-orange-400":"bg-white/5 text-neutral-500"}`}>{index+1}</span><div><p className="font-bold text-white">{row.name}</p><p className="text-[9px] text-neutral-600">{row.email}</p></div></div></td>{PERIODS.map(({key})=><td key={key} className="p-3 text-right font-mono font-bold text-white">{money(row.byPeriod[key]?.revenue||0)}</td>)}<td className="p-3 text-right font-mono font-bold text-emerald-400">{money(y?.deadProfit||0)}</td><td className="p-3 text-right font-mono font-bold text-emerald-300">{money(y?.profit||0)}</td><td className="p-3 text-right font-mono font-bold text-amber-400">{money(y?.commissions||0)}</td><td className="p-3 text-right font-bold text-sky-400">{y?.invoiceCount||0}</td><td className="p-3 text-right font-bold text-emerald-400">{percent(margin)}</td></tr>})}</tbody></table></div>
    </div>
    {(month.qualityBlockedCount||0)>0&&<div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300"><FiAlertCircle className="mr-2 inline"/>{month.qualityBlockedCount} documents are blocked from profit and commission totals because authoritative stored cost is missing.</div>}
    <div className="flex items-center gap-2 text-[10px] text-neutral-600"><FiFileText/>Every figure opens its supporting document set. Financial reads never calculate, persist, or approximate missing cost data.</div>
    <MetricDerivationModal info={metricInfo} onClose={()=>setMetricInfo(null)}/>
  </div>
}
