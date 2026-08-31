"use client"
/* eslint-disable @typescript-eslint/no-explicit-any -- SalesBoard API remains legacy/untyped */

import { useMemo } from "react"
import { FiAlertTriangle, FiMaximize, FiMinimize, FiPause, FiPlay } from "react-icons/fi"
import { useSalesBoardData } from "./useSalesBoardData"
import styles from "./FutureSalesBoard.module.css"

const money = (value: number, compact = false) => new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: compact ? 1 : 0,
  maximumFractionDigits: compact ? 1 : 0,
  notation: compact ? "compact" : "standard",
}).format(Number.isFinite(value) ? value : 0)
const pct = (value: number) => `${Math.round(Number.isFinite(value) ? value : 0)}%`
const sum = (values: number[]) => values.reduce((total, value) => total + Number(value || 0), 0)

export function FutureSalesBoard() {
  const { data, loading, lastUpdated, refreshError, currentScreen, isPaused, setIsPaused, isFullscreen, toggleFullscreen, boardRef, progress } = useSalesBoardData()

  const metrics = useMemo(() => {
    if (!data) return null
    const reps = (data.reps || []).map((rep: any) => {
      const goalDocuments = (rep.weekly?.invoices || []).filter((document: any) => {
        const type = String(document.type || "invoice").toLowerCase().replaceAll("_", "")
        return type === "invoice" || type === "salesorder"
      })
      const goalDailySales = Array.from({ length: 5 }, (_, day) => goalDocuments
        .filter((document: any) => String(document.date || "").split("T")[0] === data.weekDays?.[day])
        .reduce((total: number, document: any) => total + Number(document.subtotal ?? document.amount ?? 0), 0))
      const goalDailyProfit = Array.from({ length: 5 }, (_, day) => goalDocuments
        .filter((document: any) => String(document.date || "").split("T")[0] === data.weekDays?.[day])
        .reduce((total: number, document: any) => total + Number(document.profit || 0), 0))
      const goalDailyCount = Array.from({ length: 5 }, (_, day) => goalDocuments
        .filter((document: any) => String(document.date || "").split("T")[0] === data.weekDays?.[day]).length)
      const goalDailyDeadCost = Array.from({ length: 5 }, (_, day) => goalDocuments
        .filter((document: any) => String(document.date || "").split("T")[0] === data.weekDays?.[day])
        .reduce((total: number, document: any) => total + Number(document.deadCost || 0), 0))
      const goalDailyPending = Array.from({ length: 5 }, (_, day) => goalDocuments
        .filter((document: any) => String(document.date || "").split("T")[0] === data.weekDays?.[day] && document.costPending).length)
      const weekSales = sum(goalDailySales); const weekProfit = sum(goalDailyProfit); const weekDeadCost = sum(goalDailyDeadCost)
      return {
        ...rep, goalDailySales, goalDailyProfit, goalDailyDeadCost, goalDailyCount, goalDailyPending, weekSales, weekProfit, weekDeadCost,
        weekGoalPct: Number(rep.weeklyTarget || 0) > 0 ? weekProfit / Number(rep.weeklyTarget) * 100 : 0,
        mtdSales: Number(rep.mtd?.sales || 0), mtdProfit: Number(rep.mtd?.profit || 0), mtdCount: Number(rep.mtd?.dealsClosed || 0),
        ytdSales: Number(rep.ytd?.sales || 0), ytdProfit: Number(rep.ytd?.profit || 0), ytdCount: Number(rep.ytd?.dealsClosed || 0),
      }
    }).sort((a: any, b: any) => b.weekSales - a.weekSales)
    const booked = data.weeklyBreakdown?.invoice || { subtotal: 0, deadCost: 0, profit: 0, count: 0 }
    const orders = data.weeklyBreakdown?.salesorder || { subtotal: 0, deadCost: 0, profit: 0, count: 0 }
    const estimates = data.weeklyBreakdown?.estimate || { subtotal: 0, deadCost: 0, profit: 0, count: 0 }
    const target = sum(reps.map((rep: any) => Number(rep.weeklyTarget || 0)))
    const goalSales = Number(booked.subtotal || 0) + Number(orders.subtotal || 0)
    const goalProfit = Number(booked.profit || 0) + Number(orders.profit || 0)
    const goalDeadCost = Number(booked.deadCost || 0) + Number(orders.deadCost || 0)
    // Company tiles use the company-wide roll-up (house accounts, hidden and
    // deactivated reps included) so the TV agrees with the exec/dashboard MTD.
    const companyMtd = data.companyTotals?.mtd
    const companyYtd = data.companyTotals?.ytd
    const mtdSales = companyMtd ? Number(companyMtd.sales || 0) : sum(reps.map((rep: any) => rep.mtdSales))
    const mtdProfit = companyMtd ? Number(companyMtd.profit || 0) : sum(reps.map((rep: any) => rep.mtdProfit))
    const mtdCount = companyMtd ? Number(companyMtd.dealsClosed || 0) : sum(reps.map((rep: any) => rep.mtdCount))
    const ytdSales = companyYtd ? Number(companyYtd.sales || 0) : sum(reps.map((rep: any) => rep.ytdSales))
    const ytdProfit = companyYtd ? Number(companyYtd.profit || 0) : sum(reps.map((rep: any) => rep.ytdProfit))
    const ytdCount = companyYtd ? Number(companyYtd.dealsClosed || 0) : sum(reps.map((rep: any) => rep.ytdCount))
    const dailySales = Array.from({ length: 5 }, (_, day) => sum(reps.map((rep: any) => Number(rep.goalDailySales?.[day] || 0))))
    const dailyProfit = Array.from({ length: 5 }, (_, day) => sum(reps.map((rep: any) => Number(rep.goalDailyProfit?.[day] || 0))))
    const dailyLeaders = Array.from({ length: 5 }, (_, day) => Math.max(0, ...reps.map((rep: any) => Number(rep.goalDailySales?.[day] || 0))))
    const monthlySales = reps.flatMap((rep: any) => (rep.mtd?.invoices || []).map((invoice: any) => ({ ...invoice, repName: rep.name }))).sort((a: any, b: any) => String(b.date || "").localeCompare(String(a.date || "")))
    const accounts = new Map<string, { name: string; sales: number; count: number }>()
    monthlySales.forEach((sale: any) => { const name = String(sale.customer || "Unknown"); const current = accounts.get(name) || { name, sales: 0, count: 0 }; current.sales += Number(sale.amount || 0); current.count += 1; accounts.set(name, current) })
    const topAccounts = [...accounts.values()].sort((a, b) => b.sales - a.sales)
    const largestInvoice = monthlySales.slice().sort((a: any, b: any) => Number(b.amount || 0) - Number(a.amount || 0))[0]
    const topWeekRep = reps[0]; const topMonthRep = reps.slice().sort((a: any, b: any) => b.mtdSales - a.mtdSales)[0]
    const mostActiveRep = reps.slice().sort((a: any, b: any) => b.mtdCount - a.mtdCount)[0]
    const bestMarginRep = reps.filter((rep: any) => rep.mtdSales > 0).sort((a: any, b: any) => (b.mtdProfit / b.mtdSales) - (a.mtdProfit / a.mtdSales))[0]
    const overdueReps = Object.values(data.repOverdueMap || {}).sort((a: any, b: any) => b.totalBalance - a.totalBalance)
    const facts = [
      { label: "TOP REP THIS WEEK", value: topWeekRep?.name || "—", detail: `${money(topWeekRep?.weekProfit || 0)} dead profit`, tone: "orange" },
      { label: "TOP REP THIS MONTH", value: topMonthRep?.name || "—", detail: `${money(topMonthRep?.mtdSales || 0)} across ${topMonthRep?.mtdCount || 0} invoices`, tone: "green" },
      { label: "MOST ACTIVE CLOSER", value: mostActiveRep?.name || "—", detail: `${mostActiveRep?.mtdCount || 0} booked invoices this month`, tone: "purple" },
      { label: "BEST MTD MARGIN", value: bestMarginRep?.name || "—", detail: pct(bestMarginRep?.mtdSales ? bestMarginRep.mtdProfit / bestMarginRep.mtdSales * 100 : 0), tone: "cyan" },
      { label: "TOP CUSTOMER THIS MONTH", value: topAccounts[0]?.name || "—", detail: `${money(topAccounts[0]?.sales || 0)} across ${topAccounts[0]?.count || 0} invoices`, tone: "orange" },
      { label: "LARGEST MTD INVOICE", value: largestInvoice?.customer || "—", detail: `${money(Number(largestInvoice?.amount || 0))} · ${largestInvoice?.repName || "unassigned"}`, tone: "green" },
      { label: "YEAR-TO-DATE SALES", value: money(ytdSales), detail: `${ytdCount} invoices · ${money(ytdProfit)} dead profit`, tone: "purple" },
      { label: "ACTIVE PIPELINE", value: money(Number(orders.subtotal || 0) + Number(estimates.subtotal || 0)), detail: `${Number(orders.count || 0) + Number(estimates.count || 0)} unbooked documents`, tone: "cyan" },
    ]
    return { reps, booked, orders, estimates, target, goalSales, goalProfit, goalDeadCost, mtdSales, mtdProfit, mtdCount, ytdSales, ytdProfit, ytdCount, dailySales, dailyProfit, dailyLeaders, monthlySales, topAccounts, overdueReps, facts }
  }, [data])

  if (loading && !data) return <div className={styles.loading}><div className={styles.loader} />Loading live sales data</div>
  if (!data || !metrics) return <div className={styles.loading}><FiAlertTriangle />Sales data unavailable</div>

  const scene = currentScreen === "WEEKLY_GRID" ? "pulse" : currentScreen === "REPS_KPI" ? "reps" : currentScreen === "MTD_STATS" ? "goals" : currentScreen === "YTD_STATS" ? "spotlight" : "facts"
  const goalPct = metrics.target > 0 ? metrics.goalProfit / metrics.target * 100 : 0
  const rotationSeed = Math.floor((lastUpdated?.getTime() || 0) / 60000)
  const spotlight = metrics.reps.length ? metrics.reps[rotationSeed % metrics.reps.length] : null
  const factStart = rotationSeed % Math.max(1, metrics.facts.length)
  const visibleFacts = Array.from({ length: 4 }, (_, index) => metrics.facts[(factStart + index) % metrics.facts.length])
  const updated = lastUpdated?.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) || "cached"

  return <div ref={boardRef} className={styles.board}>
    <header className={styles.header}>
      <div className={styles.brand}><img className={styles.fullLogo} src="/images/brand/logo-system/titan-horizontal-light.png" alt="Titan Diamond USA" /><small>SALES COMMAND CENTER</small></div>
      <div className={styles.live}><i className={refreshError ? styles.warn : ""} />{refreshError ? "VERIFIED CACHE" : "LIVE LOCAL DATA"}<span>UPDATED {updated}</span></div>
      <div className={styles.controls}><button onClick={() => setIsPaused(!isPaused)} aria-label={isPaused ? "Resume" : "Pause"}>{isPaused ? <FiPlay /> : <FiPause />}</button><button onClick={toggleFullscreen} aria-label="Fullscreen">{isFullscreen ? <FiMinimize /> : <FiMaximize />}</button></div>
    </header>

    <main className={styles.topStage}>
      <section className={`${styles.scene} ${scene === "pulse" ? styles.active : ""}`}>
        <div className={styles.sceneTitle}><span>01 / SALES PULSE</span><h2>WHAT IS HAPPENING NOW</h2></div>
        <div className={styles.kpiGrid}>
          <article className={styles.kpi}><small>DEAD PROFIT · WEEK</small><strong className={styles.green}>{money(metrics.goalProfit)}</strong><span>{data.missingCostCount > 0 ? `Processing costs for ${data.missingCostCount} invoice${data.missingCostCount === 1 ? "" : "s"}` : `Invoices + sales orders · ${pct(goalPct)} of goal`}</span><div className={styles.kpiDetail}><b>{money(metrics.goalSales)} SUBTOTAL</b><b>{money(metrics.goalDeadCost)} DEAD COST</b><b>{data.missingCostCount > 0 ? "COST SYNC ACTIVE" : `${pct(metrics.goalSales ? metrics.goalProfit / metrics.goalSales * 100 : 0)} MARGIN`}</b></div></article>
          <article className={styles.kpi}><small>ACTIVE WEEKLY SUBTOTAL</small><strong className={styles.orange}>{money(Number(metrics.booked.subtotal || 0) + Number(metrics.orders.subtotal || 0) + Number(metrics.estimates.subtotal || 0))}</strong><span>Invoices + orders + estimates</span><div className={styles.kpiDetail}><b>{metrics.booked.count} INV · {money(Number(metrics.booked.subtotal || 0), true)}</b><b>{metrics.orders.count} SO · {money(Number(metrics.orders.subtotal || 0), true)}</b><b>{metrics.estimates.count} EST · {money(Number(metrics.estimates.subtotal || 0), true)}</b></div></article>
          <article className={styles.kpi}><small>MONTH-TO-DATE SALES</small><strong className={styles.purple}>{money(metrics.mtdSales)}</strong><span>{metrics.mtdCount} booked invoices</span><div className={styles.kpiDetail}><b>{money(metrics.mtdProfit)} DEAD PROFIT</b><b>{pct(metrics.mtdSales ? metrics.mtdProfit / metrics.mtdSales * 100 : 0)} MARGIN</b></div></article>
          <article className={styles.kpi}><small>UNBOOKED PIPELINE</small><strong className={styles.cyan}>{money(Number(metrics.orders.subtotal || 0) + Number(metrics.estimates.subtotal || 0))}</strong><span>{Number(metrics.orders.count || 0) + Number(metrics.estimates.count || 0)} active documents</span><div className={styles.kpiDetail}><b>{money(Number(metrics.orders.deadCost || 0))} SO DEAD COST</b><b>{money(Number(metrics.orders.profit || 0))} SO DEAD PROFIT</b><b>{money(Number(metrics.estimates.subtotal || 0))} EST</b></div></article>
        </div>
      </section>

      <section className={`${styles.scene} ${scene === "reps" ? styles.active : ""}`}>
        <div className={styles.sceneTitle}><span>02 / ALL REPRESENTATIVES</span><h2>TEAM PERFORMANCE</h2></div>
        <div className={styles.repGrid}>{metrics.reps.slice(0, 8).map((rep: any, index: number) => <article className={styles.repCard} key={rep.id}><b>{String(index + 1).padStart(2, "0")}</b><div><h3>{rep.name}</h3><small>{rep.mtdCount} MTD INVOICES · {pct(rep.weekGoalPct)} GOAL</small></div><strong>{money(rep.weekSales, true)}</strong><span>{money(rep.weekDeadCost, true)} DEAD COST · {money(rep.weekProfit, true)} DEAD PROFIT</span><div><i style={{ width: `${Math.min(100, rep.weekGoalPct)}%` }} /></div></article>)}</div>
      </section>

      <section className={`${styles.scene} ${scene === "goals" ? styles.active : ""}`}>
        <div className={styles.goalHero}><span>03 / FULL TEAM GOALS</span><h2>{pct(goalPct)}</h2><p>OF {money(metrics.target)} WEEKLY DEAD PROFIT TARGET</p><div><i style={{ width: `${Math.min(100, goalPct)}%` }} /></div></div>
        <div className={styles.goalList}>{metrics.reps.slice(0, 7).map((rep: any) => <div key={rep.id}><strong>{rep.name}</strong><span>{money(rep.weekSales)} SUBTOTAL · {money(rep.weekDeadCost)} DC · {money(rep.weekProfit)} DP</span><div><i style={{ width: `${Math.min(100, rep.weekGoalPct)}%` }} /></div><b>{pct(rep.weekGoalPct)}</b></div>)}</div>
      </section>

      <section className={`${styles.scene} ${scene === "spotlight" ? styles.active : ""}`}>
        {spotlight && <><div className={styles.spotlightName}><span>04 / REP SPOTLIGHT</span><i>{String(spotlight.name || "?").charAt(0)}</i><h2>{spotlight.name}</h2><p>{pct(spotlight.weekGoalPct)} OF WEEKLY DEAD PROFIT GOAL</p></div><div className={styles.spotlightStats}><article><small>WEEKLY SUBTOTAL</small><strong>{money(spotlight.weekSales)}</strong><span>{spotlight.goalDailyCount.reduce((a: number, b: number) => a + b, 0)} DOCUMENTS</span></article><article><small>WEEKLY DEAD COST</small><strong>{money(spotlight.weekDeadCost)}</strong><span>{pct(spotlight.weekSales ? spotlight.weekDeadCost / spotlight.weekSales * 100 : 0)} OF SUBTOTAL</span></article><article><small>WEEKLY DEAD PROFIT</small><strong>{money(spotlight.weekProfit)}</strong><span>{pct(spotlight.weekSales ? spotlight.weekProfit / spotlight.weekSales * 100 : 0)} MARGIN</span></article><article><small>ACTIVE PIPELINE</small><strong>{money(Number(spotlight.activePipeline?.salesOrderAmount || 0) + Number(spotlight.activePipeline?.estimateAmount || 0))}</strong><span>{Number(spotlight.activePipeline?.salesOrderCount || 0) + Number(spotlight.activePipeline?.estimateCount || 0)} DOCUMENTS</span></article></div></>}
      </section>

      <section className={`${styles.scene} ${scene === "facts" ? styles.active : ""}`}>
        <div className={styles.sceneTitle}><span>05 / SALES INTELLIGENCE</span><h2>INTERESTING RIGHT NOW</h2></div>
        <div className={styles.factGrid}>{visibleFacts.map((fact, index) => <article className={`${styles.fact} ${styles[fact.tone]}`} key={`${fact.label}-${index}`}><small>{fact.label}</small><strong>{fact.value}</strong><span>{fact.detail}</span></article>)}</div>
        <div className={styles.collectionsBar}><span>COLLECTIONS PULSE</span><strong>{money(Number(data.totalOverdueBalance || 0))} OVERDUE</strong><small>{Number(data.totalOverdueCount || 0)} invoices · oldest {Number(data.maxSystemOverdueDays || 0)} days</small></div>
      </section>
    </main>

    <section className={styles.weekBoard} aria-label="Weekly sales by representative and day">
          <div className={styles.weekTitle}><div><i /><strong>LIVE WEEKLY SALES BY REP</strong></div><span>INVOICES + SALES ORDERS · PAYMENT STATUS DOES NOT AFFECT GOALS</span></div>
      <div className={`${styles.weekRow} ${styles.weekHeader}`}><span>SALES REP</span>{["MON", "TUE", "WED", "THU", "FRI"].map((day, index) => <span key={day}>{day}<small>{String(data.weekDays?.[index] || "").slice(5).replace("-", "/")}</small></span>)}<span>WEEK TOTAL</span></div>
      <div className={styles.weekBody}>{metrics.reps.slice(0, 7).map((rep: any) => <div className={styles.weekRow} key={rep.id}><div className={styles.weekRep}><i>{String(rep.name || "?").charAt(0)}</i><span className={styles.weekRepIdentity}><strong>{rep.name}</strong><small>MTD {money(rep.mtdSales, true)} SUBTOTAL · {money(rep.mtdProfit, true)} DEAD PROFIT</small></span></div>{[0,1,2,3,4].map(day => { const daySales = Number(rep.goalDailySales?.[day] || 0); const dayProfit = Number(rep.goalDailyProfit?.[day] || 0); const dayCount = Number(rep.goalDailyCount?.[day] || 0); const pendingCosts = Number(rep.goalDailyPending?.[day] || 0); const dayMargin = daySales > 0 ? dayProfit / daySales * 100 : 0; const isLeader = daySales > 0 && daySales === metrics.dailyLeaders[day]; return <div className={`${styles.weekDay} ${isLeader ? styles.dayLeader : ""}`} key={day}>{isLeader && <em>★ DAY LEADER</em>}<div className={styles.dailyFinancials}><span><small>SUBTOTAL</small><strong>{daySales ? money(daySales, true) : "—"}</strong></span><span><small>DEAD PROFIT</small><strong className={styles.dailyProfitValue}>{daySales ? money(dayProfit, true) : "—"}</strong></span></div>{pendingCosts > 0 ? <small className={styles.costPending}>PROCESSING {pendingCosts} COST{pendingCosts === 1 ? "" : "S"}</small> : daySales ? <small className={styles.dailyMeta}><span>{dayCount} DOC</span><span>{pct(dayMargin)} MARGIN</span></small> : <small>NO SALES</small>}</div>})}<div className={`${styles.weekDay} ${styles.weekTotal}`}><strong>{money(rep.weekSales, true)}</strong><small>{rep.goalDailyPending.some((value: number) => value > 0) ? "COSTS PROCESSING" : `${money(rep.weekProfit, true)} DEAD PROFIT`}</small></div></div>)}</div>
      <div className={`${styles.weekRow} ${styles.teamRow}`}><strong>TEAM TOTAL</strong>{metrics.dailySales.map((value, day) => <div className={styles.weekDay} key={day}><strong>{money(value, true)}</strong><small>{money(metrics.dailyProfit[day], true)} DEAD PROFIT</small></div>)}<div className={`${styles.weekDay} ${styles.weekTotal}`}><strong>{money(sum(metrics.dailySales), true)}</strong><small>{money(sum(metrics.dailyProfit), true)} DEAD PROFIT</small></div></div>
    </section>

    <footer className={styles.footer}><span>{scene.toUpperCase()}</span><div>{["WEEKLY_GRID","REPS_KPI","MTD_STATS","YTD_STATS","OVERDUE_INVOICES"].map(screen => <i className={currentScreen === screen ? styles.on : ""} key={screen} />)}</div><span>LOCAL DATABASE · ZOHO SYNC</span><b style={{ width: `${progress}%` }} /></footer>
  </div>
}
