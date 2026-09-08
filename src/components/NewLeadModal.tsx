"use client"

import { useState } from "react"
import { FiLoader, FiUserPlus, FiX } from "react-icons/fi"
import { toast } from "react-hot-toast"

type LeadForm = { company: string; firstName: string; lastName: string; title: string; industry: string; phone: string; mobile: string; email: string; street: string; city: string; state: string; zip: string; timeZone: string }
const EMPTY: LeadForm = { company: "", firstName: "", lastName: "", title: "", industry: "Concrete Cutting", phone: "", mobile: "", email: "", street: "", city: "", state: "", zip: "", timeZone: "America/Phoenix" }

export function NewLeadModal({ isOpen, onClose, onCreated }: { isOpen: boolean; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  if (!isOpen) return null

  const field = (name: keyof LeadForm, label: string, required = false, type = "text") => <label className="space-y-1 text-xs font-bold text-neutral-300"><span>{label}{required && <span className="text-rose-400"> *</span>}</span><input type={type} value={form[name]} onChange={event => setForm(current => ({ ...current, [name]: event.target.value }))} aria-invalid={Boolean(errors[name])} className="min-h-11 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white outline-none focus:border-orange-400" />{errors[name] && <span className="block text-[11px] text-rose-400">{errors[name]}</span>}</label>

  const save = async () => {
    setSaving(true); setErrors({})
    try {
      const response = await fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
      const data = await response.json()
      if (!response.ok) { setErrors(data.fieldErrors || {}); throw new Error(data.error || "Lead could not be created") }
      toast.success("Lead created and added to the CRM lead queue")
      setForm(EMPTY); onCreated(); onClose()
    } catch (error) { toast.error(error instanceof Error ? error.message : "Lead could not be created") }
    finally { setSaving(false) }
  }

  return <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="new-lead-title">
    <div className="flex max-h-[94dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#111317] shadow-2xl">
      <header className="flex items-center justify-between border-b border-white/10 px-5 py-4"><div><h2 id="new-lead-title" className="flex items-center gap-2 text-lg font-black text-white"><FiUserPlus className="text-orange-400" /> Add Sales Lead</h2><p className="mt-1 text-xs text-neutral-500">Capture the customer before qualification and conversion.</p></div><button onClick={onClose} aria-label="Close lead form" className="grid min-h-11 min-w-11 place-items-center rounded-xl text-neutral-400 hover:bg-white/10 hover:text-white"><FiX /></button></header>
      <div className="grid flex-1 gap-4 overflow-y-auto p-5 sm:grid-cols-2">
        {field("company", "Company", true)} {field("industry", "Industry")}
        {field("firstName", "First name", true)} {field("lastName", "Last name", true)}
        {errors.contact && <p className="sm:col-span-2 text-xs text-rose-400">{errors.contact}</p>}
        {field("title", "Job title")} {field("email", "Email", false, "email")}
        {field("mobile", "Mobile phone", true, "tel")} {field("phone", "Office phone", false, "tel")}
        <div className="sm:col-span-2">{field("street", "Street address")}</div>
        {field("city", "City")} {field("state", "State")}
        {field("zip", "ZIP code")} <label className="space-y-1 text-xs font-bold text-neutral-300"><span>Timezone</span><select value={form.timeZone} onChange={event => setForm(current => ({ ...current, timeZone: event.target.value }))} className="min-h-11 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white"><option value="America/Phoenix">Arizona</option><option value="America/Los_Angeles">Pacific</option><option value="America/Denver">Mountain</option><option value="America/Chicago">Central</option><option value="America/New_York">Eastern</option></select></label>
      </div>
      <footer className="flex justify-end gap-3 border-t border-white/10 px-5 py-4"><button onClick={onClose} className="min-h-11 rounded-xl border border-white/10 px-5 text-sm font-bold text-neutral-300">Cancel</button><button onClick={save} disabled={saving} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-orange-500 px-5 text-sm font-black text-black disabled:opacity-50">{saving ? <FiLoader className="animate-spin" /> : <FiUserPlus />} Create Lead</button></footer>
    </div>
  </div>
}
