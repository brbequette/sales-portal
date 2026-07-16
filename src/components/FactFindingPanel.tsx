"use client"

/**
 * FactFindingPanel.tsx
 *
 * Shared fact-finding component used across:
 *   - SalesCallCampaignModal (dialer — cold + follow-up calls)
 *   - AccountEditModal (Profile Data tab — editable account profile)
 *   - AccountSlideout (compact read-only summary chips)
 *
 * Standardizes all FF fields, options, and pill-selection UX in one place.
 */

import { useState } from "react"
import { FiActivity, FiChevronDown, FiChevronRight } from "react-icons/fi"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FactFindingValues {
  bladeSizes: string          // e.g. "14\""
  materialsCut: string        // e.g. "Concrete"
  currentSupplier: string     // e.g. "Home Depot"
  avgBladeCost: string        // e.g. "$100-150"
  crewCount: string           // e.g. "2-3"
  bladesPerOrder: string      // e.g. "6-10"
  improvementPriority: string // e.g. "Longer life"
  readyToBuy: string          // e.g. "This month"
  jobTypes: string            // e.g. "Road Work"
  painPoints: string          // e.g. "Blade life"
  productInterest: string[]   // e.g. ["Dark Knight", "Titan Razor"]
}

export const EMPTY_FACT_FINDING: FactFindingValues = {
  bladeSizes: "",
  materialsCut: "",
  currentSupplier: "",
  avgBladeCost: "",
  crewCount: "",
  bladesPerOrder: "",
  improvementPriority: "",
  readyToBuy: "",
  jobTypes: "",
  painPoints: "",
  productInterest: [],
}

// ─── Option Tables ─────────────────────────────────────────────────────────────

export const FF_OPTIONS = {
  bladeSizes:          ['10"', '12"', '14"', '16"', '18"', '20"', '24"', '30"', '36"'],
  materialsCut:        ['Concrete', 'Asphalt', 'Brick', 'Block', 'Stone', 'Pavers', 'Granite', 'Marble', 'Tile', 'Ductile Iron', 'Rebar', 'Green Concrete'],
  currentSupplier:     ['Home Depot', 'Lowes', 'Sunbelt', 'United Rentals', 'White Cap', 'HD Supply', 'Ace', 'Local Supplier', 'Online', 'Manufacturer Direct', 'Other'],
  avgBladeCost:        ['$25-50', '$50-75', '$75-100', '$100-150', '$150-200', '$200-300', '$300-400', '$400+'],
  crewCount:           ['1', '2-3', '4-5', '6-10', '10+'],
  bladesPerOrder:      ['1-3', '4-6', '6-10', '12-25', '25+'],
  improvementPriority: ['Longer life', 'Faster cutting', 'Cleaner cutting', 'Lower price'],
  readyToBuy:          ['Right now', 'This week', 'This month', 'Just browsing'],
  jobTypes:            ['Road Work', 'Commercial', 'Residential', 'Industrial', 'Landscaping', 'Demolition'],
  painPoints:          ['Speed', 'Blade life', 'Chip-out', 'Price', 'Availability'],
}

// ─── Question Definitions ──────────────────────────────────────────────────────

interface Question {
  num: number
  key: keyof FactFindingValues
  label: string
  coldQ: string
  followUpQ: string
  options: string[]
  multi?: boolean
}

export const FF_QUESTIONS: Question[] = [
  {
    num: 1, key: "bladeSizes",
    label: "Blade Sizes",
    coldQ: '"First off... what size blades do you run? 14"?',
    followUpQ: '"What size blades are you running?"',
    options: FF_OPTIONS.bladeSizes,
  },
  {
    num: 2, key: "materialsCut",
    label: "Materials Cut",
    coldQ: '"What are you guys cutting out there?"',
    followUpQ: '"What materials are you cutting?"',
    options: FF_OPTIONS.materialsCut,
  },
  {
    num: 3, key: "currentSupplier",
    label: "Current Supplier",
    coldQ: '"Where do you pick up your blades now, do you buy them retail or over the phone from a wholesaler like me?"',
    followUpQ: '"Where do you pick up your blades?"',
    options: FF_OPTIONS.currentSupplier,
  },
  {
    num: 4, key: "avgBladeCost",
    label: "Avg Blade Cost",
    coldQ: '"How much are they charging you for a good 14" blade? $250? $300 Bucks?"',
    followUpQ: '"How much are they charging you?"',
    options: FF_OPTIONS.avgBladeCost,
  },
  {
    num: 5, key: "crewCount",
    label: "Crew Count",
    coldQ: '"How many crews do you have?"',
    followUpQ: '"How many crews do you have?"',
    options: FF_OPTIONS.crewCount,
  },
  {
    num: 6, key: "bladesPerOrder",
    label: "Blades Per Order",
    coldQ: '"And how many blades do you normally pick up at a time.. 6.. 12.. 25?"',
    followUpQ: '"How many blades do you pick up at a time?"',
    options: FF_OPTIONS.bladesPerOrder,
  },
  {
    num: 7, key: "improvementPriority",
    label: "Improvement Priority",
    coldQ: '"If you could improve one thing about the blades you are using right now... what would it be... longer life... faster cutting... or cleaner cutting?"',
    followUpQ: '"What would you improve about your blades?"',
    options: FF_OPTIONS.improvementPriority,
  },
  {
    num: 8, key: "readyToBuy",
    label: "Ready to Buy",
    coldQ: '"Are you looking to pick up some blades today, or are you just doing some research?"',
    followUpQ: '"Are you ready to place an order today?"',
    options: FF_OPTIONS.readyToBuy,
  },
  {
    num: 9, key: "jobTypes",
    label: "Job Types",
    coldQ: '"What kinds of jobs are you running — road work, commercial, residential?"',
    followUpQ: '"What types of jobs are you working on?"',
    options: FF_OPTIONS.jobTypes,
    multi: true,
  },
  {
    num: 10, key: "painPoints",
    label: "Pain Points",
    coldQ: '"What is the biggest problem you have with your current blades?"',
    followUpQ: '"What frustrates you most about your current blades?"',
    options: FF_OPTIONS.painPoints,
  },
]

// ─── Subcomponents ─────────────────────────────────────────────────────────────

interface PillRowProps {
  options: string[]
  value: string
  onChange: (v: string) => void
  accentColor?: "cyan" | "amber"
}

function PillRow({ options, value, onChange, accentColor = "cyan" }: PillRowProps) {
  const activeClass = accentColor === "amber"
    ? "bg-amber-500/20 border-amber-500/50 text-amber-300 shadow-sm shadow-amber-500/10"
    : "bg-cyan-500/20 border-cyan-500/50 text-cyan-300 shadow-sm shadow-cyan-500/10"

  return (
    <div className="flex gap-1.5 flex-wrap">
      {options.map(opt => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(value === opt ? "" : opt)}
          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${
            value === opt
              ? activeClass
              : "bg-neutral-900 border-neutral-700/60 text-neutral-500 hover:border-neutral-600 hover:text-neutral-400"
          }`}
        >
          {value === opt ? "✓ " : ""}{opt}
        </button>
      ))}
    </div>
  )
}

// ─── Compact Summary (read-only chips) ────────────────────────────────────────

export function FactFindingSummary({ values }: { values: FactFindingValues }) {
  const chips: { label: string; value: string }[] = [
    { label: "Blades", value: values.bladeSizes },
    { label: "Cuts", value: values.materialsCut },
    { label: "Supplier", value: values.currentSupplier },
    { label: "Pays", value: values.avgBladeCost },
    { label: "Crews", value: values.crewCount },
    { label: "Qty", value: values.bladesPerOrder },
    { label: "Wants", value: values.improvementPriority },
    { label: "Timeline", value: values.readyToBuy },
    { label: "Jobs", value: values.jobTypes },
    { label: "Pain", value: values.painPoints },
  ].filter(c => c.value)

  if (chips.length === 0) return (
    <span className="text-[10px] text-neutral-600 italic">No fact-finding data recorded yet.</span>
  )

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <FiActivity size={9} className="text-amber-500/60" />
      {chips.map(({ label, value }) => (
        <span key={label} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-500/5 border border-amber-500/10">
          <span className="text-[7px] font-bold text-neutral-600">{label}:</span>
          <span className="text-[8px] font-bold text-amber-300">{value}</span>
        </span>
      ))}
    </div>
  )
}

// ─── Main Panel ────────────────────────────────────────────────────────────────

export interface FactFindingPanelProps {
  values: FactFindingValues
  onChange: (v: FactFindingValues) => void
  /** "dialer-cold" = with cold call questions; "dialer-followup" = follow-up phrasing; "profile" = no script phrasing */
  mode?: "dialer-cold" | "dialer-followup" | "profile"
  readOnly?: boolean
  showProgress?: boolean
  /** Number of questions to show. Defaults to 7 (core). Set to 10 for full panel. */
  questionCount?: 7 | 10
  accentColor?: "cyan" | "amber"
}

export function FactFindingPanel({
  values,
  onChange,
  mode = "dialer-cold",
  readOnly = false,
  showProgress = true,
  questionCount = 7,
  accentColor = "cyan",
}: FactFindingPanelProps) {
  const [expandedFF, setExpandedFF] = useState<Record<string, boolean>>({})

  const questions = FF_QUESTIONS.slice(0, questionCount)
  const answeredCount = questions.filter(q => {
    const v = values[q.key]
    return Array.isArray(v) ? v.length > 0 : !!v
  }).length

  const getQuestion = (q: Question) => mode === "dialer-followup" ? q.followUpQ : q.coldQ

  const handleChange = (key: keyof FactFindingValues, val: string) => {
    if (readOnly) return
    onChange({ ...values, [key]: val })
  }

  // ── Profile mode (no script phrasing) ───────────────────────────────────────
  if (mode === "profile") {
    return (
      <div className="space-y-4">
        {questions.map(q => {
          const value = values[q.key] as string
          return (
            <div key={q.key}>
              <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block mb-1.5">
                {q.label}
              </label>
              <PillRow
                options={q.options}
                value={value}
                onChange={v => handleChange(q.key, v)}
                accentColor="amber"
              />
            </div>
          )
        })}
      </div>
    )
  }

  // ── Dialer mode (collapsible question cards) ─────────────────────────────────
  const borderColor = accentColor === "amber" ? "border-amber-800/30 bg-amber-950/20" : "border-cyan-800/30 bg-cyan-950/20"
  const answeredBorder = accentColor === "amber" ? "border-amber-800/15 bg-amber-950/10" : "border-cyan-800/15 bg-cyan-950/10"
  const numColor = (isAnswered: boolean) => isAnswered
    ? (accentColor === "amber" ? "bg-amber-500/20 text-amber-400" : "bg-amber-500/20 text-amber-400")
    : (accentColor === "cyan" ? "bg-cyan-500/20 text-cyan-400" : "bg-amber-500/10 text-amber-500")
  const textColor = accentColor === "amber" ? "text-amber-200/80" : "text-cyan-100/90"

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {questions.map(q => {
          const value = values[q.key] as string
          const isAnswered = !!value
          const isExpanded = expandedFF[q.key] ?? !isAnswered

          return (
            <div
              key={q.key}
              className={`rounded-xl border transition-all ${
                isAnswered && !isExpanded ? `p-2 ${answeredBorder}` : `p-3 space-y-2 ${borderColor}`
              }`}
            >
              {isAnswered && !isExpanded ? (
                // Collapsed answered chip
                <button
                  type="button"
                  onClick={() => setExpandedFF(prev => ({ ...prev, [q.key]: true }))}
                  className="w-full flex items-center gap-2 cursor-pointer group"
                >
                  <span className="w-4 h-4 rounded-full bg-amber-500/20 text-amber-400 text-[8px] font-black flex items-center justify-center shrink-0">✓</span>
                  <span className="text-[10px] text-neutral-500 italic truncate flex-1 text-left">Q{q.num}</span>
                  <span className="text-[9px] font-bold text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded truncate max-w-[140px]">{value}</span>
                  <FiChevronRight size={10} className="text-neutral-600 group-hover:text-neutral-400 transition-colors shrink-0" />
                </button>
              ) : (
                // Expanded question + options
                <>
                  <div className="flex items-start gap-2">
                    <span className={`w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5 ${numColor(isAnswered)}`}>
                      {q.num}
                    </span>
                    <p className={`text-xs leading-relaxed italic flex-1 ${textColor}`}>
                      {getQuestion(q)}
                    </p>
                    {isAnswered && (
                      <button
                        type="button"
                        onClick={() => setExpandedFF(prev => ({ ...prev, [q.key]: false }))}
                        className="text-neutral-600 hover:text-neutral-400 cursor-pointer shrink-0 mt-0.5"
                      >
                        <FiChevronDown size={12} />
                      </button>
                    )}
                  </div>
                  <div className="pl-7">
                    {readOnly ? (
                      <span className="text-[10px] text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded font-bold">{value || "—"}</span>
                    ) : (
                      <PillRow
                        options={q.options}
                        value={value}
                        onChange={v => handleChange(q.key, v)}
                        accentColor={accentColor}
                      />
                    )}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* Progress */}
      {showProgress && (
        <div className="flex items-center justify-between bg-neutral-900/40 border border-neutral-800/40 rounded-lg px-3 py-1.5 mt-2">
          <span className="text-[9px] font-bold text-neutral-500 uppercase tracking-wider flex items-center gap-1.5">
            <FiActivity size={10} /> Fact-Finding Progress
          </span>
          <div className="flex items-center gap-1">
            {questions.map((q, i) => {
              const v = values[q.key]
              const filled = Array.isArray(v) ? v.length > 0 : !!v
              return <div key={i} className={`w-2 h-2 rounded-full ${filled ? "bg-amber-400" : "bg-neutral-800"}`} />
            })}
            <span className="text-[9px] font-black text-amber-400 ml-1">{answeredCount}/{questions.length}</span>
          </div>
        </div>
      )}
    </div>
  )
}
