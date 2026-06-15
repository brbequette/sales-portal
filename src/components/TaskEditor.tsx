import { useState, useEffect } from "react"
import { FiEdit2, FiCheck, FiX } from "react-icons/fi"

export function TaskEditor({ task, onSave }: { task: any, onSave: () => void }) {
  const [isEditing, setIsEditing] = useState(false)
  const [subject, setSubject] = useState(task.subject || "")
  const [description, setDescription] = useState(task.description || "")
  const [dueDate, setDueDate] = useState(task.dueDate ? task.dueDate.split('T')[0] : "")
  const [status, setStatus] = useState(task.status || "Not Started")
  const [ownerId, setOwnerId] = useState(task.ownerId || "")
  
  const [users, setUsers] = useState<any[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isEditing && users.length === 0) {
      fetch('/api/get-users').then(res => res.json()).then(data => {
        if (data.success) setUsers(data.users)
      }).catch(console.error)
    }
  }, [isEditing])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/update-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: task.id,
          subject,
          description,
          dueDate: dueDate ? new Date(dueDate).toISOString() : null,
          status,
          ownerId
        })
      })
      if (res.ok) {
        setIsEditing(false)
        onSave()
      } else {
        const err = await res.json()
        alert("Failed to save task: " + (err.error || err.message))
      }
    } catch (e: any) {
      alert("Error: " + e.message)
    } finally {
      setSaving(false)
    }
  }

  if (!isEditing) {
    return (
      <div className="bg-neutral-800/50 border border-neutral-700 p-4 rounded-lg flex justify-between items-center group">
        <div>
          <div className="font-bold text-white flex items-center gap-2">
            {task.subject}
            <button onClick={() => setIsEditing(true)} className="text-neutral-500 hover:text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity">
              <FiEdit2 size={14} />
            </button>
          </div>
          <div className="text-xs text-neutral-400 mt-1">{task.description || "No description"}</div>
        </div>
        <div className="text-right">
          <div className={`text-xs font-bold px-2 py-0.5 rounded-full inline-block ${task.status === 'Completed' ? 'bg-emerald-900/40 text-emerald-400' : 'bg-amber-900/40 text-amber-400'}`}>
            {task.status}
          </div>
          {task.dueDate && <div className="text-xs text-neutral-500 mt-1">Due: {new Date(task.dueDate).toLocaleDateString()}</div>}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-neutral-800 border border-emerald-500/30 p-4 rounded-lg space-y-3 relative">
      <div className="flex gap-2">
        <input 
          value={subject} 
          onChange={e => setSubject(e.target.value)}
          placeholder="Task Name"
          className="flex-1 bg-black border border-neutral-700 rounded px-3 py-1.5 text-sm text-white focus:border-emerald-500 focus:outline-none" 
        />
      </div>
      <div>
        <textarea 
          value={description} 
          onChange={e => setDescription(e.target.value)}
          placeholder="Notes/comments"
          className="w-full bg-black border border-neutral-700 rounded px-3 py-1.5 text-sm text-white focus:border-emerald-500 focus:outline-none h-20"
        />
      </div>
      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-[120px]">
          <label className="text-xs text-neutral-500 block mb-1">Due Date</label>
          <input 
            type="date"
            value={dueDate} 
            onChange={e => setDueDate(e.target.value)}
            className="w-full bg-black border border-neutral-700 rounded px-2 py-1.5 text-sm text-white focus:border-emerald-500 focus:outline-none" 
          />
        </div>
        <div className="flex-1 min-w-[120px]">
          <label className="text-xs text-neutral-500 block mb-1">Status</label>
          <select 
            value={status} 
            onChange={e => setStatus(e.target.value)}
            className="w-full bg-black border border-neutral-700 rounded px-2 py-1.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
          >
            <option value="Not Started">Not Started</option>
            <option value="In Progress">In Progress</option>
            <option value="Deferred">Deferred</option>
            <option value="Completed">Completed</option>
            <option value="Waiting on someone else">Waiting</option>
          </select>
        </div>
        <div className="flex-1 min-w-[120px]">
          <label className="text-xs text-neutral-500 block mb-1">Assigned To</label>
          <select 
            value={ownerId} 
            onChange={e => setOwnerId(e.target.value)}
            className="w-full bg-black border border-neutral-700 rounded px-2 py-1.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
          >
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2 border-t border-neutral-700 mt-2">
        <button onClick={() => setIsEditing(false)} className="px-3 py-1.5 text-xs text-neutral-400 hover:text-white transition">Cancel</button>
        <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded font-bold transition flex items-center gap-1">
          {saving ? 'Saving...' : <><FiCheck /> Save</>}
        </button>
      </div>
    </div>
  )
}
