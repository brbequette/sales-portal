"use client"

import React from "react"
import { 
  FiTrendingUp, 
  FiPieChart, 
  FiFilter, 
  FiPhone, 
  FiPackage, 
  FiClock, 
  FiDollarSign, 
  FiCreditCard, 
  FiAward 
} from "react-icons/fi"

const formatCurrency = (val: number) => 
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(val || 0)

const formatPercent = (val: number) => `${Math.round(val || 0)}%`

interface WidgetProps {
  data: any
}

// 1. REVENUE VS GOAL CHART WIDGET
export function RevenueVsGoalWidget({ data }: WidgetProps) {
  const profit = data?.teamWeekly?.profit || 0
  const target = data?.teamWeekly?.target || 1
  const pct = Math.min(100, Math.round((profit / target) * 100))

  return (
    <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 h-full flex flex-col justify-between backdrop-blur-xl hover:border-emerald-500/30 transition-all">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-xs font-bold uppercase tracking-widest text-neutral-400 flex items-center gap-2">
          <FiTrendingUp className="text-emerald-400" /> Revenue vs Goal Progress
        </h4>
        <span className="text-xs font-black text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
          {pct}% Achieved
        </span>
      </div>

      <div className="space-y-4 my-auto">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-2xl font-black text-white">{formatCurrency(profit)}</div>
            <div className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider">Weekly Profit Earned</div>
          </div>
          <div className="text-right">
            <div className="text-base font-bold text-neutral-400">{formatCurrency(target)}</div>
            <div className="text-[10px] text-neutral-600 font-bold uppercase tracking-wider">Weekly Target</div>
          </div>
        </div>

        {/* Progress Bar Container */}
        <div className="w-full bg-white/5 h-4 rounded-full overflow-hidden border border-white/10 relative">
          <div 
            className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-1000 shadow-[0_0_15px_rgba(52,211,153,0.4)]"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="flex justify-between items-center text-[10px] text-neutral-500 uppercase font-bold pt-4 border-t border-white/10">
        <span>Remaining: {formatCurrency(Math.max(0, target - profit))}</span>
        <span>Pacing: On Track</span>
      </div>
    </div>
  )
}

// 2. VIG COST ALLOCATION DONUT CHART WIDGET
export function VigCostAllocationWidget({ data }: WidgetProps) {
  const subject = data?.teamWeekly?.deadCostSubjectToVig || 0
  const noVig = data?.teamWeekly?.deadCostNoVig || 0
  const total = subject + noVig || 1
  const subjectPct = Math.round((subject / total) * 100)
  const noVigPct = Math.round((noVig / total) * 100)

  return (
    <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 h-full flex flex-col justify-between backdrop-blur-xl hover:border-purple-500/30 transition-all">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-xs font-bold uppercase tracking-widest text-neutral-400 flex items-center gap-2">
          <FiPieChart className="text-purple-400" /> VIG Cost Allocation
        </h4>
        <span className="text-xs font-bold text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/20">
          Total: {formatCurrency(total)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 items-center my-auto">
        {/* Visual Ratio Ring */}
        <div className="relative w-24 h-24 mx-auto flex items-center justify-center">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
            <path
              className="text-amber-500/20"
              strokeWidth="4"
              stroke="currentColor"
              fill="none"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
            <path
              className="text-amber-400"
              strokeDasharray={`${subjectPct}, 100`}
              strokeWidth="4"
              strokeLinecap="round"
              stroke="currentColor"
              fill="none"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
            <path
              className="text-purple-400"
              strokeDasharray={`${noVigPct}, 100`}
              strokeDashoffset={`-${subjectPct}`}
              strokeWidth="4"
              strokeLinecap="round"
              stroke="currentColor"
              fill="none"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
          </svg>
          <div className="absolute text-center">
            <span className="text-xs font-black text-white">{subjectPct}%</span>
            <span className="text-[8px] text-neutral-500 uppercase block font-bold">VIG Subj</span>
          </div>
        </div>

        {/* Legend */}
        <div className="space-y-3">
          <div className="bg-amber-950/40 p-2.5 rounded-xl border border-amber-500/20">
            <div className="text-[9px] uppercase font-bold text-amber-400">Subject to VIG</div>
            <div className="text-sm font-black text-white">{formatCurrency(subject)}</div>
          </div>
          <div className="bg-purple-950/40 p-2.5 rounded-xl border border-purple-500/20">
            <div className="text-[9px] uppercase font-bold text-purple-300">🎁 Gifts (No VIG)</div>
            <div className="text-sm font-black text-white">{formatCurrency(noVig)}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

// 3. PIPELINE CONVERSION FUNNEL WIDGET
export function PipelineFunnelWidget({ data }: WidgetProps) {
  const reps = data?.reps || []
  const totalEstimates = reps.reduce((sum: number, r: any) => sum + (r.activePipeline?.estimateCount || 0), 0)
  const totalEstAmount = reps.reduce((sum: number, r: any) => sum + (r.activePipeline?.estimateAmount || 0), 0)
  const totalSOs = reps.reduce((sum: number, r: any) => sum + (r.activePipeline?.salesOrderCount || 0), 0)
  const totalSOAmount = reps.reduce((sum: number, r: any) => sum + (r.activePipeline?.salesOrderAmount || 0), 0)
  const dealsClosed = data?.teamWeekly?.sales || 0

  return (
    <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 h-full flex flex-col justify-between backdrop-blur-xl hover:border-cyan-500/30 transition-all">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-xs font-bold uppercase tracking-widest text-neutral-400 flex items-center gap-2">
          <FiFilter className="text-cyan-400" /> Pipeline Conversion Stage
        </h4>
        <span className="text-[10px] font-bold text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/20">
          Live Rules Active
        </span>
      </div>

      <div className="space-y-3 my-auto">
        <div className="bg-gradient-to-r from-cyan-950/60 to-blue-950/60 p-3 rounded-xl border border-cyan-500/30 flex items-center justify-between">
          <div>
            <span className="text-[9px] uppercase font-bold text-cyan-400 block">1. 48h Active Estimates</span>
            <span className="text-sm font-black text-white">{totalEstimates} Quotes ({formatCurrency(totalEstAmount)})</span>
          </div>
          <span className="text-[10px] font-bold text-cyan-300 bg-cyan-500/20 px-2 py-1 rounded">48h Limit</span>
        </div>

        <div className="bg-gradient-to-r from-amber-950/60 to-orange-950/60 p-3 rounded-xl border border-amber-500/30 flex items-center justify-between">
          <div>
            <span className="text-[9px] uppercase font-bold text-amber-400 block">2. Uninvoiced Sales Orders</span>
            <span className="text-sm font-black text-white">{totalSOs} Sales Orders ({formatCurrency(totalSOAmount)})</span>
          </div>
          <span className="text-[10px] font-bold text-amber-300 bg-amber-500/20 px-2 py-1 rounded">Until Invoiced</span>
        </div>

        <div className="bg-gradient-to-r from-emerald-950/60 to-teal-950/60 p-3 rounded-xl border border-emerald-500/30 flex items-center justify-between">
          <div>
            <span className="text-[9px] uppercase font-bold text-emerald-400 block">3. Invoiced &amp; Settled</span>
            <span className="text-sm font-black text-white">{formatCurrency(dealsClosed)}</span>
          </div>
          <span className="text-[10px] font-bold text-emerald-300 bg-emerald-500/20 px-2 py-1 rounded">50/50 Comm</span>
        </div>
      </div>
    </div>
  )
}

// 4. ZDIALER CALL & SMS ACTIVITY FEED WIDGET
export function ZDialerActivityWidget({ data }: WidgetProps) {
  return (
    <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 h-full flex flex-col justify-between backdrop-blur-xl hover:border-blue-500/30 transition-all">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-xs font-bold uppercase tracking-widest text-neutral-400 flex items-center gap-2">
          <FiPhone className="text-blue-400 animate-pulse" /> ZDialer Call &amp; Text Feed
        </h4>
        <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
          618-335-5304 Active
        </span>
      </div>

      <div className="space-y-2.5 my-auto text-xs">
        <div className="flex items-center justify-between p-2.5 bg-white/[0.03] rounded-xl border border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xs">📞</div>
            <div>
              <div className="font-bold text-white">Outbound Sales Calls</div>
              <div className="text-[10px] text-neutral-500">Auto-logged via ZDialer</div>
            </div>
          </div>
          <span className="text-sm font-black text-white">42 Calls</span>
        </div>

        <div className="flex items-center justify-between p-2.5 bg-white/[0.03] rounded-xl border border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs">💬</div>
            <div>
              <div className="font-bold text-white">SMS Communications</div>
              <div className="text-[10px] text-neutral-500">Trailing 10-digit matching</div>
            </div>
          </div>
          <span className="text-sm font-black text-emerald-400">18 Sent</span>
        </div>
      </div>
    </div>
  )
}

// 5. TIMECLOCK & ACTIVE SHIFT FEED WIDGET
export function TimeclockStatusWidget({ data }: WidgetProps) {
  return (
    <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 h-full flex flex-col justify-between backdrop-blur-xl hover:border-amber-500/30 transition-all">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-xs font-bold uppercase tracking-widest text-neutral-400 flex items-center gap-2">
          <FiClock className="text-amber-400" /> Active Rep Shifts
        </h4>
        <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
          Geofenced
        </span>
      </div>

      <div className="space-y-2 my-auto">
        {(data?.reps || []).slice(0, 3).map((rep: any) => (
          <div key={rep.id} className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02] border border-white/5 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span className="font-bold text-white">{rep.name}</span>
            </div>
            <span className="text-[10px] text-neutral-400 font-mono">Clocked In (7.5h)</span>
          </div>
        ))}
      </div>
    </div>
  )
}
