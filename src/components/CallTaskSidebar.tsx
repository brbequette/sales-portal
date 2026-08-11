"use client"

import React, { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { toast } from 'react-hot-toast'
import { 
  FiCheckCircle, FiPlus, FiEdit, FiTrash2, FiCalendar, FiClock, 
  FiUser, FiCheck, FiX, FiAlertCircle, FiRefreshCw, FiPhone, 
  FiMail, FiFileText, FiChevronDown, FiChevronUp, FiMoreVertical
} from 'react-icons/fi'

interface CallTaskSidebarProps {
  tasks: any[]
  setTasks: React.Dispatch<React.SetStateAction<any[]>>
  accounts: any[]
  ownerFilter: string
  currentUserId: string
  mobileTab: string
  onRefresh: () => void
}

// Helpers
const isOverdue = (dateString: string | null) => {
  if (!dateString) return false
  const due = new Date(dateString)
  due.setHours(0, 0, 0, 0)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return due < now
}

const getDaysDifference = (dateString: string | null) => {
  if (!dateString) return null
  const due = new Date(dateString)
  due.setHours(0, 0, 0, 0)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const diffTime = due.getTime() - now.getTime()
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}

const formatDueDate = (dateString: string | null) => {
  if (!dateString) return 'No due date'
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Sub-components
const ConfirmDialog = ({ isOpen, title, message, onConfirm, onCancel, confirmText = "Confirm", confirmColor = "bg-blue-600 hover:bg-blue-700" }: any) => {
  if (!isOpen) return null
  return (
    <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-white/10 rounded-2xl p-6 max-w-sm w-full shadow-2xl flex flex-col space-y-4">
        <div className="flex items-center space-x-3 text-white">
          <FiAlertCircle className="w-6 h-6 text-yellow-500" />
          <h3 className="text-lg font-semibold">{title}</h3>
        </div>
        <p className="text-sm text-neutral-300">{message}</p>
        <div className="flex justify-end space-x-3 pt-2">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm text-white bg-neutral-800 hover:bg-neutral-700 transition">Cancel</button>
          <button onClick={onConfirm} className={`px-4 py-2 rounded-lg text-sm text-white transition ${confirmColor}`}>{confirmText}</button>
        </div>
      </div>
    </div>
  )
}

export function CallTaskSidebar({ tasks, setTasks, accounts, ownerFilter, currentUserId, mobileTab, onRefresh }: CallTaskSidebarProps) {
  const [activeTab, setActiveTab] = useState<'Due' | 'Pending' | 'Completed' | 'All'>('Pending')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<any>(null)
  
  const [confirmState, setConfirmState] = useState<{isOpen: boolean, action: 'delete' | 'complete' | null, taskId: string | null, zohoId: string | null}>({
    isOpen: false, action: null, taskId: null, zohoId: null
  })

  // Task form state
  const [formData, setFormData] = useState({
    subject: '',
    description: '',
    priority: 'Normal',
    status: 'Not Started',
    dueDate: '',
    type: 'Task',
    accountId: ''
  })
  
  const [accountSearch, setAccountSearch] = useState('')
  const [showAccountDropdown, setShowAccountDropdown] = useState(false)

  // Reschedule dropdown state
  const [rescheduleTask, setRescheduleTask] = useState<{id: string, zohoId: string} | null>(null)
  const rescheduleRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (rescheduleRef.current && !rescheduleRef.current.contains(event.target as Node)) {
        setRescheduleTask(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Derived state
  const filteredTasks = tasks.filter(t => {
    if (ownerFilter !== 'All' && t.ownerId !== ownerFilter) return false
    
    if (activeTab === 'Due') return t.status !== 'Completed' && isOverdue(t.dueDate)
    if (activeTab === 'Pending') return t.status !== 'Completed'
    if (activeTab === 'Completed') return t.status === 'Completed'
    return true
  }).sort((a, b) => {
    if (!a.dueDate) return 1
    if (!b.dueDate) return -1
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
  })

  const counts = {
    Due: tasks.filter(t => (ownerFilter === 'All' || t.ownerId === ownerFilter) && t.status !== 'Completed' && isOverdue(t.dueDate)).length,
    Pending: tasks.filter(t => (ownerFilter === 'All' || t.ownerId === ownerFilter) && t.status !== 'Completed').length,
    Completed: tasks.filter(t => (ownerFilter === 'All' || t.ownerId === ownerFilter) && t.status === 'Completed').length,
    All: tasks.filter(t => (ownerFilter === 'All' || t.ownerId === ownerFilter)).length
  }

  // Handlers
  const handleOpenModal = (task?: any) => {
    if (task) {
      setEditingTask(task)
      setFormData({
        subject: task.subject || '',
        description: task.description || '',
        priority: task.priority || 'Normal',
        status: task.status || 'Not Started',
        dueDate: task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : '',
        type: task.type || 'Task',
        accountId: task.accountId || ''
      })
      const acc = accounts.find(a => a.zohoId === task.accountId || a.id === task.accountId)
      setAccountSearch(acc ? (acc.Account_Name || acc.name || '') : '')
    } else {
      setEditingTask(null)
      setFormData({
        subject: '', description: '', priority: 'Normal', status: 'Not Started', dueDate: '', type: 'Task', accountId: ''
      })
      setAccountSearch('')
    }
    setIsModalOpen(true)
  }

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.subject.trim()) {
      toast.error('Subject is required')
      return
    }

    const payload = {
      ...formData,
      taskId: editingTask?.id,
      zohoId: editingTask?.zohoId,
      ownerId: currentUserId
    }

    const url = editingTask ? '/api/update-task' : '/api/create-task'
    const method = editingTask ? 'PUT' : 'POST'

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!res.ok) throw new Error('Failed to save task')
      
      toast.success(`Task ${editingTask ? 'updated' : 'created'} successfully`)
      setIsModalOpen(false)
      onRefresh()
    } catch (err) {
      console.error(err)
      toast.error('Error saving task')
    }
  }

  const handleDeleteConfirm = async () => {
    if (!confirmState.taskId) return
    try {
      const res = await fetch('/api/delete-task', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: confirmState.taskId, zohoId: confirmState.zohoId })
      })
      if (!res.ok) throw new Error('Failed to delete task')
      toast.success('Task deleted')
      setTasks(prev => prev.filter(t => t.id !== confirmState.taskId && t.zohoId !== confirmState.taskId))
    } catch (err) {
      console.error(err)
      toast.error('Error deleting task')
    } finally {
      setConfirmState({ isOpen: false, action: null, taskId: null, zohoId: null })
    }
  }

  const handleCompleteConfirm = async () => {
    if (!confirmState.taskId) return
    try {
      const res = await fetch('/api/update-task', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: confirmState.taskId, zohoId: confirmState.zohoId, status: 'Completed' })
      })
      if (!res.ok) throw new Error('Failed to complete task')
      toast.success('Task marked as completed')
      setTasks(prev => prev.map(t => (t.id === confirmState.taskId || t.zohoId === confirmState.taskId) ? { ...t, status: 'Completed' } : t))
    } catch (err) {
      console.error(err)
      toast.error('Error completing task')
    } finally {
      setConfirmState({ isOpen: false, action: null, taskId: null, zohoId: null })
    }
  }

  const handleReschedule = async (taskId: string, zohoId: string, daysToAdd: number) => {
    const newDate = new Date()
    newDate.setDate(newDate.getDate() + daysToAdd)
    const dueDateStr = newDate.toISOString().split('T')[0]
    
    try {
      const res = await fetch('/api/update-task', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, zohoId, dueDate: dueDateStr })
      })
      if (!res.ok) throw new Error('Failed to reschedule')
      toast.success('Task rescheduled')
      setTasks(prev => prev.map(t => (t.id === taskId || t.zohoId === taskId) ? { ...t, dueDate: dueDateStr } : t))
      setRescheduleTask(null)
    } catch (err) {
      console.error(err)
      toast.error('Error rescheduling task')
    }
  }

  // Account search filtering
  const filteredAccounts = accounts.filter(a => {
    const name = a.Account_Name || a.name || ''
    return name.toLowerCase().includes(accountSearch.toLowerCase())
  }).slice(0, 10)

  return (
    <div className={`w-full flex-col h-full ${mobileTab === 'tasks' ? 'flex' : 'hidden lg:flex'}`}>
      <div className="bg-neutral-900/60 rounded-2xl border border-white/10 p-4 shadow-xl flex flex-col h-full max-h-[calc(100vh-100px)]">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <FiCheckCircle className="text-blue-400" />
            Tasks & Follow-ups
            <span className="bg-white/10 text-xs px-2 py-0.5 rounded-full text-neutral-300">{counts.All}</span>
          </h2>
          <div className="flex items-center gap-2">
            <button onClick={onRefresh} className="p-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-neutral-400 transition" title="Refresh">
              <FiRefreshCw />
            </button>
            <button onClick={() => handleOpenModal()} className="p-1.5 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 rounded-lg transition" title="Add Task">
              <FiPlus />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex space-x-1 bg-black/20 p-1 rounded-xl mb-4 text-sm font-medium overflow-x-auto scrollbar-hide">
          {(['Due', 'Pending', 'Completed', 'All'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-1.5 px-3 rounded-lg flex items-center justify-center gap-1.5 transition whitespace-nowrap
                ${activeTab === tab ? 'bg-white/10 text-white shadow-sm' : 'text-neutral-400 hover:text-neutral-200 hover:bg-white/5'}`}
            >
              {tab}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full 
                ${activeTab === tab ? 'bg-white/20 text-white' : 'bg-white/10 text-neutral-400'}
                ${tab === 'Due' && counts.Due > 0 ? 'bg-red-500/20 text-red-400' : ''}
              `}>
                {counts[tab]}
              </span>
            </button>
          ))}
        </div>

        {/* Task List */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1 custom-scrollbar">
          {filteredTasks.length === 0 ? (
            <div className="text-center py-8 text-neutral-500">
              <FiCheckCircle className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>No tasks found.</p>
            </div>
          ) : (
            filteredTasks.map(task => {
              const tid = task.id || task.zohoId
              const daysDiff = getDaysDifference(task.dueDate)
              const isPastDue = isOverdue(task.dueDate)
              const isCompleted = task.status === 'Completed'
              const acc = accounts.find(a => a.zohoId === task.accountId || a.id === task.accountId)
              
              let priorityColor = "bg-neutral-800 text-neutral-400 border-neutral-700"
              if (task.priority === 'High') priorityColor = "bg-red-500/10 text-red-400 border-red-500/20"
              else if (task.priority === 'Normal') priorityColor = "bg-blue-500/10 text-blue-400 border-blue-500/20"

              return (
                <div key={tid} className="p-3 bg-white/[0.02] border border-white/5 rounded-xl hover:border-white/10 transition group">
                  <div className="flex items-start gap-3">
                    {/* Checkbox */}
                    <button 
                      onClick={() => !isCompleted && setConfirmState({ isOpen: true, action: 'complete', taskId: task.id, zohoId: task.zohoId })}
                      disabled={isCompleted}
                      className={`mt-0.5 w-5 h-5 rounded-full border flex flex-shrink-0 items-center justify-center transition
                        ${isCompleted ? 'bg-green-500 border-green-500 text-white' : 'border-white/20 hover:border-green-500 hover:bg-green-500/10 text-transparent hover:text-green-500'}
                      `}
                    >
                      <FiCheck size={12} />
                    </button>
                    
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-1">
                        <h4 className={`text-sm font-medium truncate pr-2 ${isCompleted ? 'line-through text-neutral-500' : 'text-white'}`}>
                          {task.subject || 'Untitled Task'}
                        </h4>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap ${priorityColor}`}>
                          {task.priority || 'Normal'}
                        </span>
                      </div>
                      
                      {task.description && (
                        <p className={`text-xs mb-2 line-clamp-2 ${isCompleted ? 'text-neutral-600' : 'text-neutral-400'}`}>
                          {task.description}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-y-2 gap-x-4 text-xs mt-2">
                        {/* Due Date */}
                        <div className={`flex items-center gap-1 ${isPastDue && !isCompleted ? 'text-red-400' : 'text-neutral-500'}`}>
                          <FiCalendar />
                          <span>{formatDueDate(task.dueDate)}</span>
                          {!isCompleted && daysDiff !== null && (
                            <span className="opacity-75">
                              ({daysDiff < 0 ? `${Math.abs(daysDiff)}d ago` : daysDiff === 0 ? 'Today' : `${daysDiff}d left`})
                            </span>
                          )}
                        </div>
                        
                        {/* Account Link */}
                        {acc && (
                          <div className="flex items-center gap-1 text-blue-400 hover:text-blue-300">
                            <FiUser />
                            <Link href={`/account?id=${acc.zohoId || acc.id}`} className="hover:underline truncate max-w-[120px]">
                              {acc.Account_Name || acc.name || 'Account'}
                            </Link>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between opacity-50 group-hover:opacity-100 transition-opacity">
                    <div className="flex items-center gap-2">
                      {acc?.phone && (
                        <Link href={`/account?id=${acc.zohoId || acc.id}&tab=communications`} className="p-1.5 bg-white/5 hover:bg-white/10 rounded-md text-neutral-300 transition" title="Call">
                          <FiPhone size={14} />
                        </Link>
                      )}
                      {acc?.email && (
                        <Link href={`/account?id=${acc.zohoId || acc.id}&tab=communications`} className="p-1.5 bg-white/5 hover:bg-white/10 rounded-md text-neutral-300 transition" title="Email">
                          <FiMail size={14} />
                        </Link>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-1 relative">
                      <button onClick={() => handleOpenModal(task)} className="p-1.5 hover:bg-white/10 rounded-md text-neutral-400 transition" title="Edit">
                        <FiEdit size={14} />
                      </button>
                      
                      {!isCompleted && (
                        <div className="relative">
                          <button 
                            onClick={() => setRescheduleTask(rescheduleTask?.id === task.id ? null : {id: task.id, zohoId: task.zohoId})} 
                            className="p-1.5 hover:bg-white/10 rounded-md text-neutral-400 transition" 
                            title="Reschedule"
                          >
                            <FiClock size={14} />
                          </button>
                          
                          {/* Reschedule Dropdown */}
                          {rescheduleTask?.id === task.id && (
                            <div ref={rescheduleRef} className="absolute bottom-full right-0 mb-1 w-32 bg-neutral-800 border border-white/10 rounded-lg shadow-xl overflow-hidden z-10">
                              <button onClick={() => handleReschedule(task.id, task.zohoId, 1)} className="w-full text-left px-3 py-2 text-sm text-white hover:bg-white/10">Tomorrow</button>
                              <button onClick={() => handleReschedule(task.id, task.zohoId, 2)} className="w-full text-left px-3 py-2 text-sm text-white hover:bg-white/10">In 2 Days</button>
                              <button onClick={() => handleReschedule(task.id, task.zohoId, 7)} className="w-full text-left px-3 py-2 text-sm text-white hover:bg-white/10">Next Week</button>
                            </div>
                          )}
                        </div>
                      )}
                      
                      <button onClick={() => setConfirmState({ isOpen: true, action: 'delete', taskId: task.id, zohoId: task.zohoId })} className="p-1.5 hover:bg-red-500/20 hover:text-red-400 rounded-md text-neutral-400 transition" title="Delete">
                        <FiTrash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Confirmation Dialogs */}
      <ConfirmDialog 
        isOpen={confirmState.isOpen && confirmState.action === 'delete'}
        title="Delete Task"
        message="Are you sure you want to delete this task? This cannot be undone."
        confirmText="Delete"
        confirmColor="bg-red-600 hover:bg-red-700"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setConfirmState({ isOpen: false, action: null, taskId: null, zohoId: null })}
      />

      <ConfirmDialog 
        isOpen={confirmState.isOpen && confirmState.action === 'complete'}
        title="Complete Task"
        message="Mark this task as completed?"
        confirmText="Complete"
        confirmColor="bg-green-600 hover:bg-green-700"
        onConfirm={handleCompleteConfirm}
        onCancel={() => setConfirmState({ isOpen: false, action: null, taskId: null, zohoId: null })}
      />

      {/* Task Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-5 border-b border-white/10">
              <h3 className="text-lg font-semibold text-white">{editingTask ? 'Edit Task' : 'New Task'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-neutral-400 hover:text-white transition">
                <FiX size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSaveTask} className="p-5 overflow-y-auto space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">Subject *</label>
                <input 
                  type="text" 
                  value={formData.subject}
                  onChange={e => setFormData({...formData, subject: e.target.value})}
                  className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">Account</label>
                <div className="relative">
                  <input 
                    type="text" 
                    value={accountSearch}
                    onChange={e => {
                      setAccountSearch(e.target.value)
                      setShowAccountDropdown(true)
                      if (!e.target.value) setFormData({...formData, accountId: ''})
                    }}
                    onFocus={() => setShowAccountDropdown(true)}
                    placeholder="Search accounts..."
                    className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition"
                  />
                  {showAccountDropdown && accountSearch && filteredAccounts.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 max-h-40 overflow-y-auto bg-neutral-800 border border-white/10 rounded-lg shadow-xl z-20">
                      {filteredAccounts.map(acc => (
                        <div 
                          key={acc.id || acc.zohoId}
                          className="px-3 py-2 text-sm text-white hover:bg-white/10 cursor-pointer"
                          onClick={() => {
                            setAccountSearch(acc.Account_Name || acc.name || '')
                            setFormData({...formData, accountId: acc.zohoId || acc.id})
                            setShowAccountDropdown(false)
                          }}
                        >
                          {acc.Account_Name || acc.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1">Priority</label>
                  <select 
                    value={formData.priority}
                    onChange={e => setFormData({...formData, priority: e.target.value})}
                    className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition appearance-none"
                  >
                    <option value="Low">Low</option>
                    <option value="Normal">Normal</option>
                    <option value="High">High</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1">Type</label>
                  <select 
                    value={formData.type}
                    onChange={e => setFormData({...formData, type: e.target.value})}
                    className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition appearance-none"
                  >
                    <option value="Task">Task</option>
                    <option value="Call">Call</option>
                    <option value="Email">Email</option>
                    <option value="Follow-up">Follow-up</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1">Status</label>
                  <select 
                    value={formData.status}
                    onChange={e => setFormData({...formData, status: e.target.value})}
                    className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition appearance-none"
                  >
                    <option value="Not Started">Not Started</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Completed">Completed</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1">Due Date</label>
                  <input 
                    type="date" 
                    value={formData.dueDate}
                    onChange={e => setFormData({...formData, dueDate: e.target.value})}
                    className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition [color-scheme:dark]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">Description</label>
                <textarea 
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                  rows={3}
                  className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition resize-none"
                />
              </div>

              <div className="pt-4 border-t border-white/10 flex justify-end gap-3 mt-6">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-sm text-white bg-neutral-800 hover:bg-neutral-700 transition"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 rounded-lg text-sm text-white bg-blue-600 hover:bg-blue-700 transition"
                >
                  Save Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
