"use client"

import { useState, type ReactNode } from "react"
import { buildSalesCallFlow, SALES_OBJECTIONS, type CallFacts, type SalesCallType } from "@/lib/sales-call-flow"

export function GuidedSalesCall(props: { type: SalesCallType; contactName?: string; repName?: string; facts: CallFacts; purchaseNames?: string[]; children?: ReactNode; onOffer?: () => void; onCloseStep?: () => void; activeStage?: number; onStageChange?: (stage: number) => void }) {
  const [localIndex, setLocalIndex] = useState(0)
  const index = props.activeStage ?? localIndex
  const setIndex = (stage: number) => { setLocalIndex(stage); props.onStageChange?.(stage) }
  const steps = buildSalesCallFlow(props)
  const step = steps[index]
  return <section className="space-y-4 rounded-2xl border border-cyan-500/20 bg-cyan-500/[.04] p-4" aria-label="Guided sales call">
    <div><h2 className="font-bold text-white">{props.type === "cold" ? "Cold call → first order" : "Account update → next order"}</h2><p className="mt-1 text-xs text-neutral-400">Start with facts, connect the need to an offer, and finish with an agreed next step.</p></div>
    <details className="rounded-lg border border-white/10 p-3 text-sm text-neutral-300"><summary className="cursor-pointer font-bold">No answer, voicemail or buyer unavailable</summary><p className="mt-2 leading-6">Hi, this is {props.repName || "your Titan representative"} with Titan Diamond USA, calling about blades for your upcoming work. Please return my call at the callback number I provide.</p><p className="mt-2 text-xs text-neutral-400">Give your verified callback number. Record no answer or voicemail accurately, or capture the buyer&apos;s name and agreed callback time. Skip the sales stages until you reach the buyer.</p>{props.onCloseStep && <button type="button" onClick={props.onCloseStep} className="mt-3 min-h-10 rounded-lg bg-white/10 px-3 text-white">Record call attempt</button>}</details>
    <nav aria-label="Call stages" className="flex flex-wrap gap-2">{steps.map((entry, i) => <button type="button" key={entry.id} aria-current={index === i ? "step" : undefined} onClick={() => setIndex(i)} className={`min-h-10 rounded-lg px-3 py-2 text-xs font-bold ${index === i ? "bg-cyan-500 text-black" : "bg-white/5 text-neutral-300"}`}>{i + 1}. {entry.title}</button>)}</nav>
    <article aria-live="polite" className="space-y-3"><h3 className="text-sm font-bold text-cyan-300">{step.title}</h3><p className="whitespace-pre-line text-base leading-7 text-white">{step.speech}</p><p className="rounded-lg bg-black/30 p-3 text-xs leading-5 text-neutral-400">Rep cue: {step.guidance}</p></article>
    {step.id === "discover" && props.children}
    {step.id === "resolve" && <div className="space-y-2">{SALES_OBJECTIONS.map(entry => <details key={entry.trigger} className="rounded-lg border border-white/10 p-3"><summary className="cursor-pointer text-sm font-bold text-white">{entry.trigger}</summary><p className="mt-2 text-sm leading-6 text-neutral-300">{entry.response}</p></details>)}</div>}
    <div className="flex flex-wrap justify-between gap-2"><button type="button" disabled={index === 0} onClick={() => setIndex(index - 1)} className="min-h-10 rounded-lg bg-white/10 px-4 text-sm text-white disabled:opacity-30">Back</button>
      {(step.id === "offer" || step.id === "close") && props.onOffer && <button type="button" onClick={props.onOffer} className="min-h-10 rounded-lg bg-orange-400 px-4 text-sm font-bold text-black">Build quote / order</button>}
      {index < steps.length - 1 ? <button type="button" onClick={() => setIndex(index + 1)} className="min-h-10 rounded-lg bg-cyan-500 px-4 text-sm font-bold text-black">Next: {steps[index + 1].title}</button> : props.onCloseStep && <button type="button" onClick={props.onCloseStep} className="min-h-10 rounded-lg bg-cyan-500 px-4 text-sm font-bold text-black">Log outcome & follow-up</button>}
    </div>
  </section>
}
