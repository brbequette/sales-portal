"use client"

import { useEffect, useState } from "react"
import { FiMail, FiMessageSquare, FiPhoneCall, FiX, FiZap } from "react-icons/fi"
import toast from "react-hot-toast"
import type { AutodialerPlan } from "@/lib/autodialer-plan"

type Script = { id: string; name: string; callType: string; content: string }

const initialPlan: AutodialerPlan = {
  contactMode: "PRIMARY", callScriptId: "", callScript: "", smsEnabled: true, smsDelayHours: 2,
  smsBody: "Hi {{contactName}}, this is {{repName}} with Titan Diamond USA. I just tried to reach you. When is a good time to connect?",
  emailEnabled: true, emailDelayHours: 4, emailSubject: "Following up from Titan Diamond USA",
  emailBody: "Hi {{contactName}},\n\nI just tried to reach you by phone. I would like to connect about your diamond-tool needs and upcoming work. Let me know a convenient time.\n\n{{repName}}\nTitan Diamond USA",
}

export function AutodialerSetupModal({ count, onClose, onStart }: { count: number; onClose: () => void; onStart: (plan: AutodialerPlan) => void }) {
  const [plan, setPlan] = useState(initialPlan)
  const [scripts, setScripts] = useState<Script[]>([])
  const [generating, setGenerating] = useState(false)

  useEffect(() => { fetch("/api/scripts").then(r => r.json()).then(data => setScripts(data.scripts || [])).catch(() => undefined) }, [])
  const chooseScript = (id: string) => { const script = scripts.find(item => item.id === id); setPlan(current => ({ ...current, callScriptId: id, callScript: script?.content || "" })) }
  const generate = async () => {
    setGenerating(true)
    try {
      const response = await fetch("/api/autodialer/generate-plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scriptId: plan.callScriptId, current: plan }) })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || "Unable to generate campaign copy")
      setPlan(current => ({ ...current, ...payload.plan }))
      toast.success("AI created a coordinated call, text, and email sequence")
    } catch (error) { toast.error(error instanceof Error ? error.message : "AI generation failed") } finally { setGenerating(false) }
  }
  const start = () => {
    if (!plan.callScript.trim()) return toast.error("Select or enter a call script before starting")
    if (plan.smsEnabled && !plan.smsBody.trim()) return toast.error("Enter the text follow-up")
    if (plan.emailEnabled && (!plan.emailSubject.trim() || !plan.emailBody.trim())) return toast.error("Enter the email subject and message")
    onStart(plan)
  }

  return <div className="fixed inset-0 z-[240] overflow-y-auto bg-black/85 p-4"><div className="mx-auto my-5 max-w-5xl rounded-2xl border border-cyan-500/25 bg-[#090d13] text-white shadow-2xl">
    <header className="flex items-start justify-between border-b border-white/10 p-5"><div><div className="text-[10px] font-black uppercase tracking-[.2em] text-cyan-400">Autodialer sequence builder</div><h2 className="mt-1 text-2xl font-black">Configure the {count}-account outreach flow</h2><p className="mt-1 text-sm text-neutral-400">Call first, save the disposition, then schedule the selected follow-ups.</p></div><button onClick={onClose} className="rounded-lg p-2 text-neutral-400 hover:bg-white/10"><FiX /></button></header>
    <div className="grid gap-4 p-5 lg:grid-cols-3">
      <section className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4"><h3 className="flex items-center gap-2 font-black"><FiPhoneCall className="text-cyan-400" />1. Call</h3>
        <label className="mt-4 block text-xs font-bold text-neutral-400">Who to work through</label><select value={plan.contactMode} onChange={e => setPlan({ ...plan, contactMode: e.target.value as "PRIMARY" | "ALL" })} className="mt-1 w-full rounded-lg border border-white/10 bg-black p-2 text-sm"><option value="PRIMARY">Primary contact per account</option><option value="ALL">All contacts with phone numbers</option></select>
        <label className="mt-4 block text-xs font-bold text-neutral-400">Uploaded Titan script</label><select value={plan.callScriptId} onChange={e => chooseScript(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-black p-2 text-sm"><option value="">Select a script</option>{scripts.map(script => <option key={script.id} value={script.id}>{script.name} · {script.callType}</option>)}</select>
        <textarea value={plan.callScript} onChange={e => setPlan({ ...plan, callScript: e.target.value })} rows={12} placeholder="Select an uploaded script or enter the call approach" className="mt-3 w-full rounded-lg border border-white/10 bg-black/50 p-3 text-xs leading-5" />
      </section>
      <section className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4"><div className="flex items-center justify-between"><h3 className="flex items-center gap-2 font-black"><FiMessageSquare className="text-emerald-400" />2. Text</h3><input type="checkbox" checked={plan.smsEnabled} onChange={e => setPlan({ ...plan, smsEnabled: e.target.checked })} /></div>
        <label className="mt-4 block text-xs font-bold text-neutral-400">Send after disposition</label><select value={plan.smsDelayHours} disabled={!plan.smsEnabled} onChange={e => setPlan({ ...plan, smsDelayHours: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-white/10 bg-black p-2 text-sm"><option value={0}>Immediately</option><option value={1}>1 hour</option><option value={2}>2 hours</option><option value={4}>4 hours</option><option value={24}>Next day</option><option value={48}>2 days</option></select>
        <textarea value={plan.smsBody} disabled={!plan.smsEnabled} onChange={e => setPlan({ ...plan, smsBody: e.target.value })} rows={12} className="mt-3 w-full rounded-lg border border-white/10 bg-black/50 p-3 text-xs leading-5 disabled:opacity-40" />
      </section>
      <section className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4"><div className="flex items-center justify-between"><h3 className="flex items-center gap-2 font-black"><FiMail className="text-blue-400" />3. Email</h3><input type="checkbox" checked={plan.emailEnabled} onChange={e => setPlan({ ...plan, emailEnabled: e.target.checked })} /></div>
        <label className="mt-4 block text-xs font-bold text-neutral-400">Send after disposition</label><select value={plan.emailDelayHours} disabled={!plan.emailEnabled} onChange={e => setPlan({ ...plan, emailDelayHours: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-white/10 bg-black p-2 text-sm"><option value={0}>Immediately</option><option value={2}>2 hours</option><option value={4}>4 hours</option><option value={24}>Next day</option><option value={48}>2 days</option></select>
        <input value={plan.emailSubject} disabled={!plan.emailEnabled} onChange={e => setPlan({ ...plan, emailSubject: e.target.value })} className="mt-3 w-full rounded-lg border border-white/10 bg-black/50 p-2 text-xs disabled:opacity-40" />
        <textarea value={plan.emailBody} disabled={!plan.emailEnabled} onChange={e => setPlan({ ...plan, emailBody: e.target.value })} rows={9} className="mt-2 w-full rounded-lg border border-white/10 bg-black/50 p-3 text-xs leading-5 disabled:opacity-40" />
      </section>
    </div>
    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 p-5"><button onClick={generate} disabled={generating} className="flex items-center gap-2 rounded-xl border border-purple-500/30 bg-purple-500/10 px-4 py-3 text-sm font-black text-purple-200 disabled:opacity-50"><FiZap />{generating ? "Creating sequence..." : "Create all messaging with AI"}</button><div className="flex gap-2"><button onClick={onClose} className="rounded-xl border border-white/10 px-4 py-3 text-sm font-bold">Cancel</button><button onClick={start} className="rounded-xl bg-cyan-600 px-5 py-3 text-sm font-black">Start call-first campaign</button></div></footer>
  </div></div>
}
