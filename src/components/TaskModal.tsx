"use client"

import { useState, useEffect } from "react"
import { FiX } from "react-icons/fi"
import { useZoho } from "@/components/ZohoProvider"

export function TaskModal({ 
  onClose, 
  onSaved 
}: { 
  onClose: () => void; 
  onSaved?: () => void;
}) {
  const { zohoContext: currentUser } = useZoho()
  
  const [taskSubject, setTaskSubject] = useState("")
  const [taskDescription, setTaskDescription] = useState("")
  const [taskPriority, setTaskPriority] = useState("Normal")
  const [taskType, setTaskType] = useState("Task")
  const [taskDueDate, setTaskDueDate] = useState("")
  const [taskOwnerId, setTaskOwnerId] = useState("")
  const [taskWhatId, setTaskWhatId] = useState("")
  const [taskSaving, setTaskSaving] = useState(false)
  const [taskInvoiceId, setTaskInvoiceId] = useState("")
  const [taskSalesOrderId, setTaskSalesOrderId] = useState("")
  const [taskQuoteId, setTaskQuoteId] = useState("")
  const [taskEstimateId, setTaskEstimateId] = useState("")
  
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
        console.error("Error fetching modal dropdown data", e)
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
        dueDate: taskDueDate || null,
        status: "Not Started",
        ownerId: taskOwnerId || currentUser?.id,
        whatId: taskWhatId || null,
        invoiceId: taskInvoiceId || null,
        salesOrderId: taskSalesOrderId || null,
        quoteId: taskQuoteId || null,
        estimateId: taskEstimateId || null
      }
      
      const res = await fetch("/api/create-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      if (data.success) {
        if (onSaved) onSaved()
        onClose()
      } else {
        alert("Failed to create task: " + data.error)
      }
    } catch (err: any) {
      alert("Error saving task: " + err.message)
    } finally {
      setTaskSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl flex flex-col shadow-2xl text-white z-[9999] p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center pb-4 border-b border-neutral-800 mb-4">
          <h3 className="font-bold text-lg text-white">Create New Task</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-white bg-neutral-850 p-1 rounded-full">
            <FiX size={16} />
          </button>
        </div>
        <form onSubmit={handleCreateTask} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Subject *</label>
            <input 
              type="text" 
              value={taskSubject} 
              onChange={e => setTaskSubject(e.target.value)} 
              required
              placeholder="Task subject..."
              className="w-full bg-neutral-850 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Description</label>
            <textarea 
              value={taskDescription} 
              onChange={e => setTaskDescription(e.target.value)} 
              placeholder="Task details..."
              rows={3}
              className="w-full bg-neutral-850 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Type</label>
              <select 
                value={taskType} 
                onChange={e => setTaskType(e.target.value)}
                className="w-full bg-neutral-850 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value="Task">Task</option>
                <option value="Call">Call</option>
                <option value="Email">Email</option>
                <option value="Text">Text</option>
                <option value="Processing">Processing</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Priority</label>
              <select 
                value={taskPriority} 
                onChange={e => setTaskPriority(e.target.value)}
                className="w-full bg-neutral-850 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value="Normal">Normal</option>
                <option value="High">High</option>
                <option value="Low">Low</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Due Date</label>
              <input 
                type="date" 
                value={taskDueDate} 
                onChange={e => setTaskDueDate(e.target.value)} 
                className="w-full bg-neutral-850 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 text-white invert-[1] hue-rotate-180"
                style={{ colorScheme: "dark" }}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Assignee</label>
            <select 
              value={taskOwnerId} 
              onChange={e => setTaskOwnerId(e.target.value)}
              className="w-full bg-neutral-850 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              <option value={currentUser?.id || ""}>Me ({currentUser?.name || "Loading..."})</option>
              {repsList.map(r => (
                <option key={r.id} value={r.id}>{r.name || r.email}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Link to Account (Optional)</label>
            <select 
              value={taskWhatId} 
              onChange={e => setTaskWhatId(e.target.value)}
              className="w-full bg-neutral-850 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              <option value="">-- No Linked Account (Company Task) --</option>
              {accounts.map(a => (
                <option key={a.id} value={a.zohoId}>{a.name}</option>
              ))}
            </select>
          </div>
          {taskWhatId && (
            <div>
              <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Link to Transaction (Optional)</label>
              {loadingTransactions ? (
                <p className="text-xs text-neutral-500 animate-pulse italic">Loading account documents...</p>
              ) : (
                <select
                  value={selectedTransaction}
                  onChange={e => handleTransactionChange(e.target.value)}
                  className="w-full bg-neutral-850 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
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
          <div className="border-t border-neutral-800 pt-3">
            <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Linked Documents (Optional)</h4>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1">Estimate ID</label>
                <input 
                  type="text" 
                  value={taskEstimateId} 
                  onChange={e => setTaskEstimateId(e.target.value)} 
                  placeholder="e.g. EST-12345"
                  className="w-full bg-neutral-850 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1">Sales Order ID</label>
                <input 
                  type="text" 
                  value={taskSalesOrderId} 
                  onChange={e => setTaskSalesOrderId(e.target.value)} 
                  placeholder="e.g. SO-12345"
                  className="w-full bg-neutral-850 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1">Quote ID</label>
                <input 
                  type="text" 
                  value={taskQuoteId} 
                  onChange={e => setTaskQuoteId(e.target.value)} 
                  placeholder="e.g. Q-12345"
                  className="w-full bg-neutral-850 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1">Invoice ID</label>
                <input 
                  type="text" 
                  value={taskInvoiceId} 
                  onChange={e => setTaskInvoiceId(e.target.value)} 
                  placeholder="e.g. INV-12345"
                  className="w-full bg-neutral-850 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>
          <div className="pt-4 flex justify-end gap-2 border-t border-neutral-800">
            <button 
              type="button" 
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm font-semibold transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={taskSaving}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-bold shadow-lg shadow-emerald-500/20 transition-colors disabled:opacity-50"
            >
              {taskSaving ? "Saving..." : "Create Task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
