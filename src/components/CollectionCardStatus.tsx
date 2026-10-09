'use client'

import { useState } from 'react'
import { FiCreditCard } from 'react-icons/fi'
import { toast } from 'react-hot-toast'

export function CollectionCardStatus({ accountId, customerName, value, onSaved }: {
  accountId?: string; customerName: string; value?: boolean | null; onSaved: (value: boolean | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [selected, setSelected] = useState('unknown')
  const [saving, setSaving] = useState(false)
  const label = value === true ? 'Yes' : value === false ? 'No' : 'Unknown'
  async function save() {
    setSaving(true)
    try {
      const cardOnFile = selected === 'unknown' ? null : selected === 'yes'
      const response = await fetch('/api/collections/card-status', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId, cardOnFile }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error || 'Could not save card status')
      onSaved(cardOnFile); setEditing(false); toast.success('Card status saved')
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not save card status') }
    finally { setSaving(false) }
  }
  return <div className="w-full text-left" onClick={event => event.stopPropagation()}>
    <button type="button" disabled={!accountId || saving} aria-expanded={editing}
      aria-label={`Card on file: ${label} for ${customerName}`}
      title="Staff-confirmed status. Does not charge or authorize a payment."
      className={`td-btn td-btn-sm w-full ${value === true ? 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10' : 'text-neutral-300'}`}
      onClick={() => { setSelected(value === true ? 'yes' : value === false ? 'no' : 'unknown'); setEditing(!editing) }}>
      <FiCreditCard size={12} /> Card on file: {label}
    </button>
    {editing && <div className="mt-2 rounded-lg border border-white/15 bg-neutral-950 p-3 space-y-2">
      <p className="text-xs text-neutral-400 whitespace-normal">Confirm the customer has a saved card. This records status only; no card details or payment authorization.</p>
      <select aria-label={`Saved card status for ${customerName}`} value={selected} disabled={saving}
        onChange={event => setSelected(event.target.value)} className="w-full rounded border border-white/20 bg-neutral-900 p-2 text-sm">
        <option value="unknown">Unknown / needs confirmation</option><option value="yes">Yes — card on file</option><option value="no">No card on file</option>
      </select>
      <div className="flex gap-2"><button type="button" disabled={saving} onClick={save} className="td-btn td-btn-sm">{saving ? 'Saving…' : 'Save status'}</button>
        <button type="button" disabled={saving} onClick={() => setEditing(false)} className="td-btn td-btn-sm">Cancel</button></div>
    </div>}
  </div>
}
