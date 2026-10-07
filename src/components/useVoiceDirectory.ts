"use client"
import { useCallback, useEffect, useState } from 'react'
export interface VoiceLine { id: string; numberId: string; numberMapId: string; number: string; label: string; active: boolean; smsCapability: string }
export interface VoicePerson { userid: string; agentId: string; name: string; extension?: number; status: number; zvtRoleName?: string }
export function useVoiceDirectory(enabled = true) {
  const [numbers, setNumbers] = useState<VoiceLine[]>([])
  const [users, setUsers] = useState<VoicePerson[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [admin, setAdmin] = useState(false)
  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/manage-zoho-numbers', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Voice directory unavailable')
      setNumbers(data.numbers || []); setUsers(data.users || []); setAdmin(data.admin); setError('')
    } catch (e) { setNumbers([]); setUsers([]); setError(e instanceof Error ? e.message : 'Voice directory unavailable') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => {
    if (!enabled) return
    void refresh()
    const onFocus = () => { void refresh() }
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void refresh() }, 60000)
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(timer); window.removeEventListener('focus', onFocus) }
  }, [refresh, enabled])
  return { numbers, users, error, loading, admin, refresh }
}
