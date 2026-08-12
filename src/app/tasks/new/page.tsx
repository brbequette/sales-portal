"use client"


import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useZoho } from "@/components/ZohoProvider"
import { toast } from 'react-hot-toast';

export default function NewTaskPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { zohoContext: currentUser } = useZoho()
  
  const [taskSubject, setTaskSubject] = useState("")
  const [taskDescription, setTaskDescription] = useState("")
  const [taskPriority, setTaskPriority] = useState("Normal")
  const [taskType, setTaskType] = useState("Task")
  const [taskDueDate, setTaskDueDate] = useState("")
  const [taskDueTime, setTaskDueTime] = useState("")
  const [taskOwnerId, setTaskOwnerId] = useState("")
  const [taskWhatId, setTaskWhatId] = useState("")
  const [taskSaving, setTaskSaving] = useState(false)
  const [taskInvoiceId, setTaskInvoiceId] = useState("")
  const [taskSalesOrderId, setTaskSalesOrderId] = useState("")
  const [taskQuoteId, setTaskQuoteId] = useState("")
  const [taskEstimateId, setTaskEstimateId] = useState("")
  const [preselectedAccountName, setPreselectedAccountName] = useState("")
  const [reminderDate, setReminderDate] = useState("")
  const [reminderTime, setReminderTime] = useState("")
  const [reminderMethods, setReminderMethods] = useState<string[]>([])
  
  const [transactions, setTransactions] = useState<any[]>([])
  const [selectedTransaction, setSelectedTransaction] = useState("")
  const [loadingTransactions, setLoadingTransactions] = useState(false)
  
  const [accounts, setAccounts] = useState<any[]>([])
  const [repsList, setRepsList] = useState<any[]>([])

  const isAdminUser = currentUser?.role?.toLowerCase().includes("admin") || currentUser?.role === "Administrator"

  useEffect(() => {
    if (currentUser?.id) {
      setTaskOwnerId(currentUser.id)
    }
  }, [currentUser])

  // Pre-populate account from URL params (when coming from account page)
  useEffect(() => {
    const accountId = searchParams.get('accountId')
    const accountName = searchParams.get('accountName')
    if (accountId) {
      setTaskWhatId(accountId)
    }
    if (accountName) {
      setPreselectedAccountName(decodeURIComponent(accountName))
    }
  }, [searchParams])

  useEffect(() => {
    // Fetch basic data for dropdowns
    const fetchData = async () => {
      try {
        const query = currentUser?.id && !currentUser.id.includes('@')
          ? `zohoId=${currentUser.id}`
          : `email=${currentUser?.email}`
        const [accRes, repRes] = await Promise.all([
          fetch(`/api/get-accounts?${query}`),
          fetch("/api/get-update-config")
        ])
        
        const accData = await accRes.json()
        if (accData.success) setAccounts(accData.accounts || [])
          
        const repData = await repRes.json()
        if (repData.success) {
          const visibleReps = repData.config?.visibleReps || []
          const filteredUsers = repData.users?.filter((u: any) => 
            visibleReps.includes(u.id) || 
            u.role?.toLowerCase().includes("admin") || 
            u.role === "Administrator"
          ) || []
          setRepsList(filteredUsers)
        }
      } catch (e) {
        console.error("Error fetching dropdown data", e)
      }
    }
    if (currentUser?.id || currentUser?.email) fetchData()
  }, [currentUser])

  useEffect(() => {
    if (!taskWhatId) {
      setTransactions([])
      setSelectedTransaction("")
      return
    }
    const fetchTransactions = async () => {
      setLoadingTransactions(true)
      try {
        const res = await fetch(`/api/get-account-details?id=${encodeURIComponent(taskWhatId)}`)
        const data = await res.json()
        if (data.success && data.account) {
          const txs: any[] = []
          
          if (data.account.invoices) {
            data.account.invoices.forEach((inv: any) => {
              txs.push({
                id: inv.id,
                zohoId: inv.zohoId,
                type: "Invoice",
                label: `Invoice: ${inv.zohoId || inv.id} ($${(inv.amount || 0).toLocaleString()})`
              })
            })
          }

          if (data.account.salesOrders) {
            data.account.salesOrders.forEach((so: any) => {
              txs.push({
                id: so.id,
                zohoId: so.zohoId || so.id,
                type: "SalesOrder",
                label: `Sales Order: SO-${so.id} ($${(so.amount || 0).toLocaleString()})`
              })
            })
          }

          if (data.account.quotes) {
            data.account.quotes.forEach((q: any) => {
              txs.push({
                id: q.id,
                zohoId: q.zohoId || q.id,
                type: "Quote",
                label: `Quote/Est: ${q.zohoId || q.id} ($${(q.amount || 0).toLocaleString()})`
              })
            })
          }

          setTransactions(txs)
        }
      } catch (e) {
        console.error("Failed to fetch transactions for account:", e)
      } finally {
        setLoadingTransactions(false)
      }
    }
    fetchTransactions()
  }, [taskWhatId])

  const handleTransactionChange = (val: string) => {
    setSelectedTransaction(val)
    setTaskInvoiceId("")
    setTaskSalesOrderId("")
    setTaskQuoteId("")
    setTaskEstimateId("")

    if (!val) return
    const tx = transactions.find(t => t.id === val || t.zohoId === val)
    if (!tx) return

    if (tx.type === "Invoice") {
      setTaskInvoiceId(tx.zohoId || tx.id)
    } else if (tx.type === "SalesOrder") {
      setTaskSalesOrderId(tx.id || tx.zohoId)
    } else if (tx.type === "Quote") {
      setTaskQuoteId(tx.id)
      setTaskEstimateId(tx.zohoId || tx.id)
    }
  }

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!taskSubject) return
    setTaskSaving(true)
    
    try {
      const payload = {
        subject: taskSubject,
        description: taskDescription,
        priority: taskPriority,
        type: taskType,
        dueDate: taskDueDate ? (taskDueTime ? `${taskDueDate}T${taskDueTime}` : taskDueDate) : null,
        status: "Not Started",
        ownerId: taskOwnerId || currentUser?.id,
        whatId: taskWhatId || null,
        invoiceId: taskInvoiceId || null,
        salesOrderId: taskSalesOrderId || null,
        quoteId: taskQuoteId || null,
        estimateId: taskEstimateId || null,
        reminderAt: reminderDate ? (reminderTime ? `${reminderDate}T${reminderTime}` : `${reminderDate}T09:00`) : null,
        reminderMethod: reminderMethods.length > 0 ? reminderMethods.join(',') : null
      }
      
      const res = await fetch("/api/create-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      if (data.success) {
        router.push('/dashboard')
      } else {
        toast.error("Failed to create task: " + data.error)
      }
    } catch (err: any) {
      toast.error("Error saving task: " + err.message)
    } finally {
      setTaskSaving(false)
    }
  }

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center text-lg">
            ✅
          </div>
          <div>
            <h1 className="page-title">Create New Task</h1>
            <p className="page-subtitle">Add a task, call, or email to your agenda</p>
          </div>
        </div>
      </div>

      <div className="page-body">
        <div className="max-w-2xl mx-auto">
          <div className="glass-panel border border-white/10 rounded-2xl shadow-2xl p-6 lg:p-8">

          <form onSubmit={handleCreateTask} className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-2">Subject *</label>
              <input 
                type="text" 
                value={taskSubject} 
                onChange={e => setTaskSubject(e.target.value)} 
                required
                placeholder="Task subject..."
                className="w-full bg-[#111214] border border-white/15 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-2">Description</label>
              <textarea 
                value={taskDescription} 
                onChange={e => setTaskDescription(e.target.value)} 
                placeholder="Task details..."
                rows={4}
                className="w-full bg-[#111214] border border-white/15 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-2">Type</label>
                <select 
                  value={taskType} 
                  onChange={e => setTaskType(e.target.value)}
                  className="w-full bg-[#111214] border border-white/15 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value="Task">Task</option>
                  <option value="Call">Call</option>
                  <option value="Email">Email</option>
                  <option value="Text">Text</option>
                  <option value="Processing">Processing</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-2">Priority</label>
                <select 
                  value={taskPriority} 
                  onChange={e => setTaskPriority(e.target.value)}
                  className="w-full bg-[#111214] border border-white/15 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value="Normal">Normal</option>
                  <option value="High">High</option>
                  <option value="Low">Low</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-2">Due Date</label>
                <input 
                  type="date" 
                  value={taskDueDate} 
                  onChange={e => setTaskDueDate(e.target.value)} 
                  className="w-full bg-[#111214] border border-white/15 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500"
                  style={{ colorScheme: "dark" }}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-2">Time</label>
                <input 
                  type="time" 
                  value={taskDueTime} 
                  onChange={e => setTaskDueTime(e.target.value)} 
                  className="w-full bg-[#111214] border border-white/15 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500"
                  style={{ colorScheme: "dark" }}
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-2">Assignee</label>
              <select 
                value={taskOwnerId} 
                onChange={e => setTaskOwnerId(e.target.value)}
                className="w-full bg-[#111214] border border-white/15 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value={currentUser?.id || ""}>Me ({currentUser?.name || "Loading..."})</option>
                {repsList.map(r => (
                  <option key={r.id} value={r.id}>{r.name || r.email}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-2">Link to Account {preselectedAccountName ? '' : '(Optional)'}</label>
              <select 
                value={taskWhatId} 
                onChange={e => setTaskWhatId(e.target.value)}
                className="w-full bg-[#111214] border border-white/15 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value="">-- No Linked Account (Company Task) --</option>
                {preselectedAccountName && !accounts.some(a => a.zohoId === taskWhatId) && (
                  <option value={taskWhatId}>{preselectedAccountName} ✍"</option>
                )}
                {accounts.map(a => (
                  <option key={a.id} value={a.zohoId}>{a.name}</option>
                ))}
              </select>
            </div>
            
            {taskWhatId && (
              <div>
                <label className="block text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-2">Link to Transaction (Optional)</label>
                {loadingTransactions ? (
                  <p className="text-sm text-neutral-500 animate-pulse italic">Loading account documents...</p>
                ) : (
                  <select
                    value={selectedTransaction}
                    onChange={e => handleTransactionChange(e.target.value)}
                    className="w-full bg-[#111214] border border-white/15 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="">-- No Linked Document --</option>
                    {transactions.map(t => (
                      <option key={t.id || t.zohoId} value={t.id || t.zohoId}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
            
            <div className="border-t border-white/10 pt-6">
              <h4 className="text-sm font-bold text-neutral-400 uppercase tracking-wider mb-4">Linked Documents (Optional)</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Estimate ID</label>
                  <input 
                    type="text" 
                    value={taskEstimateId} 
                    onChange={e => setTaskEstimateId(e.target.value)} 
                    placeholder="e.g. EST-12345"
                    className="w-full bg-[#111214] border border-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Sales Order ID</label>
                  <input 
                    type="text" 
                    value={taskSalesOrderId} 
                    onChange={e => setTaskSalesOrderId(e.target.value)} 
                    placeholder="e.g. SO-12345"
                    className="w-full bg-[#111214] border border-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Quote ID</label>
                  <input 
                    type="text" 
                    value={taskQuoteId} 
                    onChange={e => setTaskQuoteId(e.target.value)} 
                    placeholder="e.g. Q-12345"
                    className="w-full bg-[#111214] border border-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Invoice ID</label>
                  <input 
                    type="text" 
                    value={taskInvoiceId} 
                    onChange={e => setTaskInvoiceId(e.target.value)} 
                    placeholder="e.g. INV-12345"
                    className="w-full bg-[#111214] border border-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            </div>
            
            <div className="border-t border-white/10 pt-6">
              <h4 className="text-sm font-bold text-neutral-400 uppercase tracking-wider mb-4">✨"" Reminder (Optional)</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Reminder Date</label>
                  <input 
                    type="date" 
                    value={reminderDate} 
                    onChange={e => setReminderDate(e.target.value)} 
                    className="w-full bg-[#111214] border border-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                    style={{ colorScheme: "dark" }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Reminder Time</label>
                  <input 
                    type="time" 
                    value={reminderTime} 
                    onChange={e => setReminderTime(e.target.value)} 
                    className="w-full bg-[#111214] border border-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                    style={{ colorScheme: "dark" }}
                  />
                </div>
              </div>
              {reminderDate && (
                <div>
                  <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Notify Via</label>
                  <div className="flex items-center gap-4">
                    {['push', 'sms', 'email'].map(method => (
                      <label key={method} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={reminderMethods.includes(method)}
                          onChange={e => {
                            if (e.target.checked) setReminderMethods(prev => [...prev, method])
                            else setReminderMethods(prev => prev.filter(m => m !== method))
                          }}
                          className="w-4 h-4 rounded border-white/20 bg-[#111214] text-emerald-500 focus:ring-emerald-500"
                        />
                        <span className="text-sm text-neutral-300 font-semibold capitalize">{method === 'push' ? 'Push' : method === 'sms' ? 'SMS' : 'Email'}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            <div className="pt-6 flex justify-end gap-3 border-t border-white/10">
              <button 
                type="button" 
                onClick={() => router.push('/dashboard')}
                className="px-6 py-3 rounded-xl bg-[#111214] border border-white/10 hover:bg-white/10 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 font-bold transition-colors"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                disabled={taskSaving}
                className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-bold text-white shadow-lg shadow-emerald-500/20 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {taskSaving ? "Saving..." : "Create Task"}
              </button>
            </div>
          </form>
          </div>
        </div>
      </div>
    </div>
  )
}

