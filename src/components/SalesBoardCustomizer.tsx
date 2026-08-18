"use client"

import React from "react"
import { FiX, FiMove, FiEye, FiEyeOff, FiRotateCcw, FiCheck } from "react-icons/fi"

export interface WidgetConfig {
  id: string
  title: string
  visible: boolean
  size: "1" | "2" | "3" // col span 1, 2, or 3
}

export const DEFAULT_WIDGET_LAYOUT: WidgetConfig[] = [
  { id: "KPI_SUMMARY_STRIP", title: "Top 5-Badge Metric Strip", visible: true, size: "3" },
  { id: "WEEKLY_BOARD_GRID", title: "Weekly Board Table", visible: true, size: "3" },
  { id: "REPS_TOP_PERFORMERS", title: "Weekly Top Performers Cards", visible: true, size: "3" },
  { id: "REVENUE_VS_GOAL", title: "📊 Revenue vs Goal Progress", visible: true, size: "2" },
  { id: "VIG_COST_DONUT", title: "🎁 VIG Cost Allocation Donut", visible: true, size: "1" },
  { id: "PIPELINE_FUNNEL", title: "🔄 Pipeline Conversion Funnel", visible: true, size: "2" },
  { id: "ZDIALER_FEED", title: "📞 ZDialer Call & SMS Feed", visible: true, size: "1" },
  { id: "MTD_STATS", title: "Month-To-Date Performance Table", visible: true, size: "3" },
  { id: "OVERDUE_INVOICES", title: "Aging Overdue Invoices", visible: true, size: "3" }
]

interface CustomizerProps {
  isOpen: boolean
  onClose: () => void
  widgets: WidgetConfig[]
  onUpdateWidgets: (updated: WidgetConfig[]) => void
  onReset: () => void
}

export default function SalesBoardCustomizer({
  isOpen,
  onClose,
  widgets,
  onUpdateWidgets,
  onReset
}: CustomizerProps) {
  if (!isOpen) return null

  const toggleVisibility = (id: string) => {
    const updated = widgets.map(w => w.id === id ? { ...w, visible: !w.visible } : w)
    onUpdateWidgets(updated)
  }

  const changeSize = (id: string, size: "1" | "2" | "3") => {
    const updated = widgets.map(w => w.id === id ? { ...w, size } : w)
    onUpdateWidgets(updated)
  }

  const moveWidget = (index: number, direction: "up" | "down") => {
    const targetIdx = direction === "up" ? index - 1 : index + 1
    if (targetIdx < 0 || targetIdx >= widgets.length) return
    const updated = [...widgets]
    const temp = updated[index]
    updated[index] = updated[targetIdx]
    updated[targetIdx] = temp
    onUpdateWidgets(updated)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-neutral-900 border border-white/10 rounded-2xl p-6 shadow-2xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div>
            <h3 className="text-lg font-black text-white flex items-center gap-2">
              ⚙️ Customize Sales Dashboard Layout
            </h3>
            <p className="text-xs text-neutral-400 mt-0.5">
              Reorder, resize, or toggle visibility of widgets on your live sales board.
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            <FiX size={20} />
          </button>
        </div>

        {/* Widget List */}
        <div className="flex-1 overflow-y-auto space-y-3 py-4 my-2 pr-1">
          {widgets.map((widget, idx) => (
            <div 
              key={widget.id}
              className={`p-3.5 rounded-xl border transition-all flex items-center justify-between gap-4 ${
                widget.visible 
                  ? "bg-white/[0.03] border-white/10 text-white" 
                  : "bg-white/[0.01] border-white/5 text-neutral-500 opacity-60"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-1">
                  <button 
                    onClick={() => moveWidget(idx, "up")}
                    disabled={idx === 0}
                    className="text-neutral-500 hover:text-white disabled:opacity-20 text-[10px]"
                  >
                    ▲
                  </button>
                  <button 
                    onClick={() => moveWidget(idx, "down")}
                    disabled={idx === widgets.length - 1}
                    className="text-neutral-500 hover:text-white disabled:opacity-20 text-[10px]"
                  >
                    ▼
                  </button>
                </div>

                <div>
                  <div className="text-sm font-bold">{widget.title}</div>
                  <div className="text-[10px] text-neutral-500 font-mono">ID: {widget.id}</div>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-3">
                {/* Size selector */}
                <div className="flex items-center bg-black/40 rounded-lg p-1 border border-white/10 text-[10px] font-bold">
                  <button
                    onClick={() => changeSize(widget.id, "1")}
                    className={`px-2 py-0.5 rounded ${widget.size === "1" ? "bg-emerald-500 text-black" : "text-neutral-400 hover:text-white"}`}
                  >
                    1 Col
                  </button>
                  <button
                    onClick={() => changeSize(widget.id, "2")}
                    className={`px-2 py-0.5 rounded ${widget.size === "2" ? "bg-emerald-500 text-black" : "text-neutral-400 hover:text-white"}`}
                  >
                    2 Col
                  </button>
                  <button
                    onClick={() => changeSize(widget.id, "3")}
                    className={`px-2 py-0.5 rounded ${widget.size === "3" ? "bg-emerald-500 text-black" : "text-neutral-400 hover:text-white"}`}
                  >
                    Full Width
                  </button>
                </div>

                {/* Visibility Toggle */}
                <button
                  onClick={() => toggleVisibility(widget.id)}
                  className={`p-2 rounded-lg border transition-colors ${
                    widget.visible 
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" 
                      : "bg-white/5 border-white/10 text-neutral-500"
                  }`}
                  title={widget.visible ? "Hide Widget" : "Show Widget"}
                >
                  {widget.visible ? <FiEye size={16} /> : <FiEyeOff size={16} />}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Footer Actions */}
        <div className="pt-4 border-t border-white/10 flex items-center justify-between">
          <button
            onClick={onReset}
            className="px-4 py-2 rounded-xl text-xs font-bold text-neutral-400 hover:text-white border border-white/10 hover:bg-white/5 transition-all flex items-center gap-2"
          >
            <FiRotateCcw size={14} /> Reset Layout
          </button>
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-500 text-black hover:bg-emerald-400 transition-all shadow-[0_0_15px_rgba(52,211,153,0.3)] flex items-center gap-2"
          >
            <FiCheck size={14} /> Save &amp; Apply
          </button>
        </div>
      </div>
    </div>
  )
}
