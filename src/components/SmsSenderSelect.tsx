'use client'

import { useCallback, useEffect, useState } from 'react'

export function useSmsSender(active: boolean) {
  const [numbers, setNumbers] = useState<Array<{ number: string; label?: string }>>([])
  const [selected, setSelected] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [revision, setRevision] = useState(0)
  const refresh = useCallback(() => setRevision(value => value + 1), [])
  useEffect(() => {
    if (!active) return
    const controller = new AbortController()
    setLoading(true); setError('')
    fetch('/api/manage-zoho-numbers', { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const data = await response.json()
        if (!response.ok || !data.success) throw new Error(data.error || 'Could not load assigned SMS senders')
        if (controller.signal.aborted) return
        const available = (data.numbers || []).filter((number: { active: boolean }) => number.active)
        setNumbers(available)
        setSelected(current => available.some((number: { number: string }) => number.number === current) ? current : available[0]?.number || '')
        if (!available.length) setError('No active assigned SMS sender is available.')
      }).catch(error => {
        if (!controller.signal.aborted) { setNumbers([]); setSelected(''); setError(error.message) }
      }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [active, revision])
  return { numbers, selected, setSelected, error, loading, refresh }
}

export function SmsSenderSelect({ sender }: { sender: ReturnType<typeof useSmsSender> }) {
  return <div className="space-y-1 text-xs">
    <label className="flex items-center gap-2">From
      <select aria-label="SMS sender" value={sender.selected} onChange={event => sender.setSelected(event.target.value)} disabled={sender.loading} className="min-w-0 flex-1 rounded-lg border border-white/15 bg-neutral-950 p-2 text-white">
        <option value="">{sender.loading ? 'Loading senders…' : 'Select assigned sender'}</option>
        {sender.numbers.map(number => <option key={number.number} value={number.number}>{number.label || number.number} · {number.number}</option>)}
      </select>
      <button type="button" disabled={sender.loading} onClick={sender.refresh} className="p-2 text-cyan-300">Refresh senders</button>
    </label>
    {sender.error && <p role="alert" className="text-amber-300">{sender.error}</p>}
  </div>
}
