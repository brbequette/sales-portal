"use client"

/* Campaign payloads are provider-shaped records pending a shared static model. */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { toastConfirm } from '@/lib/toastConfirm'

import { useState, useEffect, useSyncExternalStore } from "react"
import { FiTrash2, FiPlus, FiTarget, FiActivity, FiImage } from "react-icons/fi"
import { toast } from 'react-hot-toast';

export default function AdminCampaignsPage() {
  const accountName = useSyncExternalStore(
    callback => { window.addEventListener("popstate", callback); return () => window.removeEventListener("popstate", callback) },
    () => new URLSearchParams(window.location.search).get("accountName") || "",
    () => "",
  )
  const [templates, setTemplates] = useState<any[]>([])
  const [blasts, setBlasts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [channel, setChannel] = useState('SMS')

  async function fetchData() {
    try {
      const res = await fetch('/api/admin/campaigns')
      const data = await res.json()
      if (data.success) {
        setTemplates(data.templates || [])
        setBlasts(data.blasts || [])
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchData()
  }, [])

  const handleCreate = async () => {
    if (!name || !content) return toast.error("Name and Content are required")
    try {
      const res = await fetch('/api/admin/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, content, imageUrl, channel })
      })
      const data = await res.json()
      if (data.success) {
        setTemplates([data.template, ...templates])
        setShowForm(false)
        setName('')
        setContent('')
        setImageUrl('')
      } else toast.error("Error: " + data.error)
    } catch {
      toast.error("Error creating template")
    }
  }

  const handleDelete = async (id: string) => {
    toastConfirm("Delete this template?", async () => {
    try {
      const res = await fetch(`/api/admin/campaigns?id=${id}`, { method: 'DELETE' })
      if (res.ok) setTemplates(templates.filter(t => t.id !== id))
    } catch {
      toast.error("Error deleting")
    }
  });}

  if (loading) return <div className="p-8 text-neutral-400">Loading...</div>

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-purple-500/10 border border-purple-500/20 rounded-xl flex items-center justify-center">
            <FiTarget className="text-purple-500" size={17} />
          </div>
          <div>
            <h1 className="page-title">Campaign Management</h1>
            <p className="page-subtitle">Manage blast templates and view historical logs.</p>
          </div>
        </div>
      </div>

      <div className="page-body">
        {accountName && <div className="mb-5 rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100"><span className="font-black uppercase">Account context:</span> {accountName}. Build reusable content here, then return to Communications &amp; Sales to contact this account.</div>}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Templates Section */}
          <div className="glass-panel/50 border border-white/10 rounded-xl p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold text-white flex items-center gap-2"><FiTarget className="text-emerald-400" /> Predefined Templates</h2>
              <button 
                onClick={() => setShowForm(!showForm)} 
                className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-sm font-bold hover:bg-emerald-600/30 transition"
              >
                <FiPlus /> New Template
              </button>
            </div>

            {showForm && (
              <div className="mb-6 p-4 bg-black/50 border border-white/10 rounded-lg space-y-4">
                <div>
                  <label className="text-xs text-neutral-500 block mb-1">Template Name</label>
                  <input value={name} onChange={e => setName(e.target.value)} className="w-full bg-black/20 border border-neutral-700 rounded px-3 py-2 text-white focus:border-emerald-500 focus:outline-none" />
                </div>
                <div>
                  <label className="text-xs text-neutral-500 block mb-1">Channel</label>
                  <select value={channel} onChange={e => setChannel(e.target.value)} className="w-full bg-black/20 border border-neutral-700 rounded px-3 py-2 text-white focus:border-emerald-500 focus:outline-none">
                    <option value="SMS">SMS / MMS</option>
                    <option value="EMAIL">Email</option>
                    <option value="POSTAL">Postal mail</option>
                    <option value="Voice">Voice Call</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-neutral-500 block mb-1">Content</label>
                  <textarea value={content} onChange={e => setContent(e.target.value)} rows={4} className="w-full bg-black/20 border border-neutral-700 rounded px-3 py-2 text-white focus:border-emerald-500 focus:outline-none" />
                </div>
                {(channel === 'SMS' || channel === 'EMAIL') && (
                  <div>
                    <label className="text-xs text-neutral-500 block mb-1">Image URL (Optional for MMS)</label>
                    <input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://..." className="w-full bg-black/20 border border-neutral-700 rounded px-3 py-2 text-white focus:border-emerald-500 focus:outline-none" />
                  </div>
                )}
                <div className="flex justify-end pt-2">
                  <button onClick={handleCreate} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-bold transition">Save Template</button>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {templates.length === 0 && <p className="text-sm text-neutral-500 italic">No templates defined.</p>}
              {templates.map(t => (
                <div key={t.id} className="p-4 bg-black/50 border border-white/10 rounded-lg relative group">
                  <button onClick={() => handleDelete(t.id)} className="absolute top-4 right-4 text-neutral-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition"><FiTrash2 /></button>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-neutral-800 text-neutral-400 uppercase tracking-wider">{t.channel}</span>
                    <h3 className="font-bold text-white">{t.name}</h3>
                  </div>
                  <p className="text-sm text-neutral-400 whitespace-pre-wrap">{t.content}</p>
                  {t.imageUrl && <div className="mt-3 flex items-center gap-2 text-xs text-sky-400"><FiImage /> Image Attached</div>}
                </div>
              ))}
            </div>
          </div>

          {/* Historical Logs Section */}
          <div className="glass-panel/50 border border-white/10 rounded-xl p-6">
            <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2"><FiActivity className="text-purple-400" /> Historical Blasts</h2>
            <div className="space-y-4">
              {blasts.length === 0 && <p className="text-sm text-neutral-500 italic">No historical campaigns found.</p>}
              {blasts.map(blast => (
                <div key={blast.id} className="bg-black/50 border border-white/10 rounded-lg overflow-hidden">
                  <div className="p-4 border-b border-white/10 bg-black/20/50">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="font-bold text-white">{blast.name}</h3>
                        <p className="text-xs text-neutral-500 mt-1">Sent by {blast.author?.name} on {new Date(blast.createdAt).toLocaleString()}</p>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-bold text-emerald-400">{blast.sentCount} Delivered</div>
                        {blast.failedCount > 0 && <div className="text-xs font-bold text-red-400">{blast.failedCount} Failed</div>}
                      </div>
                    </div>
                    <p className="text-sm text-neutral-400 mt-3 pl-3 border-l-2 border-neutral-700">{blast.content}</p>
                  </div>
                  <div className="p-4 max-h-48 overflow-y-auto bg-black text-xs space-y-2">
                    <h4 className="font-bold text-neutral-500 mb-2 uppercase tracking-wider">Send Log</h4>
                    {blast.logs?.map((log: any) => (
                      <div key={log.id} className="flex items-center justify-between py-1 border-b border-neutral-900 last:border-0">
                        <div className="flex items-center gap-2 text-neutral-300">
                          <span className={log.status === 'SUCCESS' ? 'text-emerald-500' : 'text-red-500'}>
                            {log.status === 'SUCCESS' ? '✍"' : '✍--'}
                          </span>
                          <span className="font-medium text-white">{log.account?.name}</span>
                          <span className="text-neutral-600">via</span>
                          <span className="font-mono text-neutral-400">{log.zohoNumberUsed || 'Unknown Number'}</span>
                        </div>
                        {log.errorMessage && <span className="text-red-400 max-w-[200px] truncate" title={log.errorMessage}>{log.errorMessage}</span>}
                      </div>
                    ))}
                    {(!blast.logs || blast.logs.length === 0) && <p className="text-neutral-600 italic">No detailed logs available.</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}


