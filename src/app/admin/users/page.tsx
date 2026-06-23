"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { FiCheckSquare, FiSquare, FiUser } from "react-icons/fi"

export default function AdminUsersPage() {
  const router = useRouter()
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/users')
      .then(res => res.json())
      .then(data => {
        if (data.success) setUsers(data.users || [])
      })
      .finally(() => setLoading(false))
  }, [])

  const toggleCampaigns = async (userId: string, currentVal: boolean) => {
    const newVal = !currentVal
    
    // Optimistic UI update
    setUsers(users.map(u => u.id === userId ? { ...u, canSendCampaigns: newVal } : u))
    
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: userId, canSendCampaigns: newVal })
      })
      const data = await res.json()
      if (!data.success) {
        // Revert on failure
        setUsers(users.map(u => u.id === userId ? { ...u, canSendCampaigns: currentVal } : u))
        alert("Failed to update user: " + data.error)
      }
    } catch (e: any) {
      setUsers(users.map(u => u.id === userId ? { ...u, canSendCampaigns: currentVal } : u))
      alert("Error updating user.")
    }
  }

  if (loading) return <div className="p-8 text-neutral-400">Loading...</div>

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-neutral-200 pb-20">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <header className="flex items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-black text-white uppercase tracking-tight">User Management</h1>
            <p className="text-neutral-500 text-sm mt-1">Manage user permissions and campaign access.</p>
          </div>
          <button 
            onClick={() => router.push('/admin')}
            className="px-4 py-2 bg-neutral-900 border border-neutral-800 rounded-lg text-sm hover:bg-neutral-800 transition"
          >
            &larr; Back to Admin
          </button>
        </header>

        <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-6 backdrop-blur-md">
          <div className="space-y-4">
            {users.map((user) => (
              <div key={user.id} className="flex items-center justify-between p-4 bg-black/50 border border-neutral-800 rounded-lg">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-400">
                    <FiUser />
                  </div>
                  <div>
                    <h3 className="font-bold text-white">{user.name}</h3>
                    <p className="text-xs text-neutral-500">{user.email} &bull; {user.role}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => toggleCampaigns(user.id, user.canSendCampaigns)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded border transition-colors ${
                      user.canSendCampaigns 
                        ? 'bg-emerald-900/30 border-emerald-500/50 text-emerald-400' 
                        : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500'
                    }`}
                  >
                    {user.canSendCampaigns ? <FiCheckSquare /> : <FiSquare />}
                    <span className="text-xs font-bold uppercase">Campaigns</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
