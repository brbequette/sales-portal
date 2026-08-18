"use client"

import { useState, useEffect } from "react"
import { FiCheckSquare, FiPlus, FiClock, FiCheck } from "react-icons/fi"
import { toast } from 'react-hot-toast'

interface DocumentTasksProps {
  zohoId: string
  type: 'Invoice' | 'SalesOrder' | 'Quote'
  accountId?: string
}

export function DocumentTasks({ zohoId, type, accountId }: DocumentTasksProps) {
  const [tasks, setTasks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Form state
  const [subject, setSubject] = useState("")
  const [description, setDescription] = useState("")
  const [dueDate, setDueDate] = useState("")

  const fetchTasks = async () => {
    setLoading(true)
    try {
      // get-tasks can fetch by whatId if we update the backend, but we can also just fetch all and filter, or create a specific endpoint. 
      // For now, let's use a new endpoint or query params. Since we might need an endpoint:
      const res = await fetch(`/api/get-document-tasks?zohoId=${zohoId}&type=${type}`)
      const data = await res.json()
      if (data.success) {
        setTasks(data.tasks || [])
      }
    } catch (err) {
      console.error("Failed to fetch document tasks:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (zohoId) {
      fetchTasks()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zohoId, type])

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!subject.trim()) return toast.error("Subject is required")
    
    setIsSubmitting(true)
    try {
      // Get the currently logged in user to be the owner
      const sessionRes = await fetch('/api/auth/session')
      const sessionData = await sessionRes.json()
      const ownerId = sessionData?.user?.id || sessionData?.user?.email

      if (!ownerId) {
        toast.error("You must be logged in to create a task")
        setIsSubmitting(false)
        return
      }

      const payload: any = {
        subject,
        description,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        ownerId,
        whatId: accountId, // This links to Zoho Account
        type: 'Note'
      }

      // Link to local document record via API
      if (type === 'Invoice') payload.invoiceId = zohoId
      else if (type === 'SalesOrder') payload.salesOrderId = zohoId
      else if (type === 'Quote') payload.quoteId = zohoId

      const res = await fetch('/api/create-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      if (data.success) {
        toast.success("Task created!")
        setSubject("")
        setDescription("")
        setDueDate("")
        setShowAddForm(false)
        fetchTasks()
      } else {
        toast.error(data.message || "Failed to create task")
      }
    } catch (err) {
      console.error(err)
      toast.error("Error creating task")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCompleteTask = async (taskId: string) => {
    try {
      const res = await fetch('/api/update-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: taskId,
          status: 'Completed'
        })
      })
      const data = await res.json()
      if (data.success) {
        toast.success("Task completed!")
        fetchTasks()
      }
    } catch (err) {
      console.error(err)
      toast.error("Error updating task")
    }
  }

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-white font-bold text-sm flex items-center gap-2">
          <FiCheckSquare className="text-emerald-400" />
          Linked Tasks &amp; Notes
        </h3>
        <button 
          onClick={() => setShowAddForm(!showAddForm)}
          className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-1.5 px-3 rounded-lg flex items-center gap-1 transition-colors"
        >
          <FiPlus /> {showAddForm ? "Cancel" : "Add Task / Note"}
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleCreateTask} className="glass-panel border border-emerald-500/30 rounded-xl p-4 mb-4 bg-emerald-500/5 shadow-inner">
          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold text-neutral-400 block mb-1">Subject / Note Title <span className="text-red-400">*</span></label>
              <input 
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Follow up on payment"
                className="w-full bg-black/40 border border-white/10 rounded p-2 text-sm text-white focus:outline-none focus:border-emerald-500/50"
                required
              />
            </div>
            
            <div>
              <label className="text-xs font-bold text-neutral-400 block mb-1">Description / Internal Note</label>
              <textarea 
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add details..."
                className="w-full bg-black/40 border border-white/10 rounded p-2 text-sm text-white focus:outline-none focus:border-emerald-500/50 h-20"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-neutral-400 block mb-1">Due Date (Optional)</label>
              <input 
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded p-2 text-sm text-white focus:outline-none focus:border-emerald-500/50"
              />
            </div>
            
            <div className="flex justify-end pt-2">
              <button 
                type="submit"
                disabled={isSubmitting || !subject.trim()}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-4 rounded transition-colors disabled:opacity-50"
              >
                {isSubmitting ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center items-center py-10">
          <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-neutral-500 gap-3 glass-panel border border-white/5 rounded-xl">
          <FiCheckSquare size={28} className="opacity-30" />
          <span className="text-sm font-semibold">No tasks or notes for this document.</span>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <div key={task.id} className={`glass-panel border ${task.status === 'Completed' ? 'border-emerald-500/20 bg-emerald-500/5 opacity-70' : 'border-white/10'} rounded-xl p-4 transition-all hover:bg-white/5`}>
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className={`text-sm font-bold ${task.status === 'Completed' ? 'text-emerald-400 line-through' : 'text-white'}`}>
                      {task.subject}
                    </h4>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-black tracking-wider ${
                      task.status === 'Completed' ? 'bg-emerald-500/20 text-emerald-400' :
                      task.priority === 'High' ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'
                    }`}>
                      {task.status || 'Not Started'}
                    </span>
                  </div>
                  
                  {task.description && (
                    <p className="text-xs text-neutral-300 mt-2 whitespace-pre-wrap">{task.description}</p>
                  )}
                  
                  <div className="flex items-center gap-4 mt-3 text-[10px] font-bold text-neutral-500 tracking-wider uppercase">
                    {task.dueDate && (
                      <span className={`flex items-center gap-1 ${task.status !== 'Completed' && new Date(task.dueDate) < new Date() ? 'text-red-400' : ''}`}>
                        <FiClock size={12} />
                        Due: {new Date(task.dueDate).toLocaleDateString()}
                      </span>
                    )}
                    <span>Created: {new Date(task.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                
                {task.status !== 'Completed' && (
                  <button 
                    onClick={() => handleCompleteTask(task.id)}
                    className="shrink-0 w-8 h-8 rounded-full border border-emerald-500/30 text-emerald-500 flex items-center justify-center hover:bg-emerald-500 hover:text-white transition-colors"
                    title="Mark as completed"
                  >
                    <FiCheck />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
