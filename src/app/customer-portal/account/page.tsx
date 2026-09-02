"use client"

import { FormEvent, useEffect, useState } from "react"
import { FiCheckCircle, FiLoader, FiMapPin, FiSave, FiShield, FiUser } from "react-icons/fi"

type Profile = Record<string, string> & { contacts?: Array<Record<string, string | boolean>> }

const fields = [
  ["name", "Company name"], ["firstName", "First name"], ["lastName", "Last name"],
  ["email", "Email"], ["phone", "Phone"], ["mobilePhone", "Mobile phone"],
  ["billingStreet", "Billing street"], ["billingCity", "Billing city"], ["billingState", "Billing state"], ["billingZip", "Billing ZIP"],
  ["shippingStreet", "Shipping street"], ["shippingCity", "Shipping city"], ["shippingState", "Shipping state"], ["shippingZip", "Shipping ZIP"],
] as const

export default function CustomerAccountPage() {
  const [form, setForm] = useState<Profile>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  const load = async () => {
    const token = localStorage.getItem("td_customer_token")
    if (!token) return
    const response = await fetch("/api/customer/account", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || "Unable to load account")
    const primary = result.data.contacts?.[0] || {}
    setForm({ ...result.data, firstName: primary.firstName || "", lastName: primary.lastName || "", email: primary.email || "", phone: primary.phone || "", mobilePhone: primary.mobilePhone || "" })
  }

  useEffect(() => { load().catch((cause) => setError(cause.message)).finally(() => setLoading(false)) }, [])

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError(""); setMessage("")
    try {
      const token = localStorage.getItem("td_customer_token")
      const response = await fetch("/api/customer/account", { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(form) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Unable to save changes")
      setMessage("Your account and primary contact were updated in Titan and Zoho CRM.")
      await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save changes") } finally { setSaving(false) }
  }

  if (loading) return <div className="flex min-h-[45vh] items-center justify-center"><FiLoader className="animate-spin text-3xl text-amber-400" /></div>

  return <div className="mx-auto max-w-5xl space-y-6">
    <div><div className="text-xs font-black uppercase tracking-[.22em] text-amber-400">Account center</div><h1 className="mt-2 text-3xl font-black">Company & contact information</h1><p className="mt-2 text-neutral-400">Keep billing, delivery, and primary contact details current.</p></div>
    <form onSubmit={submit} className="space-y-6">
      <section className="rounded-3xl border border-white/10 bg-white/[.035] p-6"><h2 className="mb-5 flex items-center gap-2 text-lg font-black"><FiUser className="text-amber-400" /> Company & primary contact</h2><div className="grid gap-4 sm:grid-cols-2">{fields.slice(0,6).map(([name,label]) => <label key={name} className={name === "name" ? "sm:col-span-2" : ""}><span className="mb-2 block text-xs font-bold uppercase tracking-wider text-neutral-400">{label}</span><input type={name === "email" ? "email" : "text"} value={form[name] || ""} onChange={(e)=>setForm((current)=>({...current,[name]:e.target.value}))} className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-amber-400" /></label>)}</div></section>
      <section className="rounded-3xl border border-white/10 bg-white/[.035] p-6"><h2 className="mb-5 flex items-center gap-2 text-lg font-black"><FiMapPin className="text-amber-400" /> Billing & delivery addresses</h2><div className="grid gap-4 sm:grid-cols-2">{fields.slice(6).map(([name,label]) => <label key={name} className={name.endsWith("Street") ? "sm:col-span-2" : ""}><span className="mb-2 block text-xs font-bold uppercase tracking-wider text-neutral-400">{label}</span><input value={form[name] || ""} onChange={(e)=>setForm((current)=>({...current,[name]:e.target.value}))} className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-amber-400" /></label>)}</div></section>
      {message && <div className="flex gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-emerald-300"><FiCheckCircle className="mt-0.5" />{message}</div>}{error && <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-4 text-red-300">{error}</div>}
      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-neutral-900 p-4 sm:flex-row sm:items-center sm:justify-between"><p className="flex gap-2 text-xs text-neutral-400"><FiShield className="mt-0.5 shrink-0" /> Changes are limited to your authenticated customer account and synchronize to CRM.</p><button disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-6 py-3 font-black text-neutral-950 disabled:opacity-60">{saving ? <FiLoader className="animate-spin" /> : <FiSave />} Save changes</button></div>
    </form>
  </div>
}
