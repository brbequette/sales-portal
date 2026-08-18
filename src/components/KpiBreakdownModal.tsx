"use client"

import React, { useState, useMemo } from "react"
import { 
  FiX, 
  FiFileText, 
  FiDollarSign, 
  FiInfo, 
  FiChevronRight, 
  FiChevronUp, 
  FiChevronDown, 
  FiSearch, 
  FiEdit3, 
  FiSave, 
  FiCheck,
  FiRefreshCw
} from "react-icons/fi"
import { LineItemModal } from "./LineItemModal"

interface KpiBreakdownModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  formula: string
  documents: any[]
  onUpdateDocument?: (updatedDoc: any) => void
}

type SortField = 'docNum' | 'customer' | 'date' | 'amount' | 'deadCost' | 'profit' | 'status'
type SortOrder = 'asc' | 'desc'

export function KpiBreakdownModal({ 
  isOpen, 
  onClose, 
  title, 
  formula, 
  documents: initialDocuments,
  onUpdateDocument 
}: KpiBreakdownModalProps) {
  const [documents, setDocuments] = useState<any[]>(initialDocuments || [])
  const [selectedLineItem, setSelectedLineItem] = useState<any | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [sortField, setSortField] = useState<SortField>('date')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  
  // Inline edit state
  const [editingDocId, setEditingDocId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<{ amount: number; deadCost: number; profit: number; status: string }>({
    amount: 0,
    deadCost: 0,
    profit: 0,
    status: ""
  })
  const [isSaving, setIsSaving] = useState(false)

  // Keep local docs in sync with props
  React.useEffect(() => {
    setDocuments(initialDocuments || [])
  }, [initialDocuments])

  if (!isOpen) return null

  // Sort handler
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('desc')
    }
  }

  // Filter and sort documents
  const filteredAndSortedDocs = useMemo(() => {
    let result = [...documents]

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      result = result.filter(doc => {
        const docNum = (doc.invoiceNumber || doc.salesorder_number || doc.zohoId || "").toLowerCase()
        const customer = (doc.accountName || doc.account?.name || doc.customer_name || "").toLowerCase()
        const status = (doc.status || "").toLowerCase()
        return docNum.includes(q) || customer.includes(q) || status.includes(q)
      })
    }

    // Sort
    result.sort((a, b) => {
      let valA: any = 0
      let valB: any = 0

      switch (sortField) {
        case 'docNum':
          valA = a.invoiceNumber || a.salesorder_number || a.zohoId || ""
          valB = b.invoiceNumber || b.salesorder_number || b.zohoId || ""
          break
        case 'customer':
          valA = a.accountName || a.account?.name || a.customer_name || ""
          valB = b.accountName || b.account?.name || b.customer_name || ""
          break
        case 'date':
          valA = new Date(a.issueDate || a.date || a.orderDate || a.createdAt || 0).getTime()
          valB = new Date(b.issueDate || b.date || b.orderDate || b.createdAt || 0).getTime()
          break
        case 'amount':
          valA = parseFloat(a.amount || a.sub_total || 0)
          valB = parseFloat(b.amount || b.sub_total || 0)
          break
        case 'deadCost':
          valA = parseFloat(a.deadCost || a.deadCostTotal || 0)
          valB = parseFloat(b.deadCost || b.deadCostTotal || 0)
          break
        case 'profit':
          valA = parseFloat(a.profit || 0)
          valB = parseFloat(b.profit || 0)
          break
        case 'status':
          valA = a.status || ""
          valB = b.status || ""
          break
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1
      return 0
    })

    return result
  }, [documents, searchQuery, sortField, sortOrder])

  // Calculations
  const totalAmount = filteredAndSortedDocs.reduce((sum, doc) => sum + parseFloat(doc.amount || doc.sub_total || 0), 0)
  const totalProfit = filteredAndSortedDocs.reduce((sum, doc) => sum + parseFloat(doc.profit || 0), 0)
  const totalDeadCost = filteredAndSortedDocs.reduce((sum, doc) => sum + parseFloat(doc.deadCost || doc.deadCostTotal || 0), 0)

  // Start inline editing
  const handleStartEdit = (doc: any) => {
    const docId = doc.id || doc.zohoId || doc.invoiceNumber
    setEditingDocId(docId)
    setEditForm({
      amount: parseFloat(doc.amount || doc.sub_total || 0),
      deadCost: parseFloat(doc.deadCost || doc.deadCostTotal || 0),
      profit: parseFloat(doc.profit || 0),
      status: doc.status || "Completed"
    })
  }

  // Save inline edits
  const handleSaveEdit = async (doc: any) => {
    setIsSaving(true)
    try {
      const docId = doc.id || doc.zohoId || doc.invoiceNumber
      const updatedDoc = {
        ...doc,
        amount: editForm.amount,
        sub_total: editForm.amount,
        deadCost: editForm.deadCost,
        deadCostTotal: editForm.deadCost,
        profit: editForm.profit,
        status: editForm.status
      }

      setDocuments(prev => prev.map(d => (d.id || d.zohoId || d.invoiceNumber) === docId ? updatedDoc : d))

      if (onUpdateDocument) {
        onUpdateDocument(updatedDoc)
      }

      setEditingDocId(null)
    } catch (err) {
      console.error("Failed to save document edit", err)
    } finally {
      setIsSaving(false)
    }
  }

  const renderSortHeader = (label: string, field: SortField, alignRight = false) => {
    const isActive = sortField === field
    return (
      <th 
        onClick={() => handleSort(field)}
        className={`p-3 cursor-pointer hover:bg-white/10 transition-colors select-none ${alignRight ? 'text-right' : ''}`}
      >
        <div className={`flex items-center gap-1 ${alignRight ? 'justify-end' : ''}`}>
          <span>{label}</span>
          {isActive && (
            sortOrder === 'asc' ? <FiChevronUp size={12} className="text-emerald-400" /> : <FiChevronDown size={12} className="text-emerald-400" />
          )}
        </div>
      </th>
    )
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
        <div className="relative w-full max-w-5xl max-h-[90vh] bg-surface border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-neutral-100">
          
          {/* Modal Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-surface-2">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                <FiDollarSign size={22} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">{title}</h3>
                <p className="text-xs text-neutral-400 font-mono flex items-center gap-1 mt-0.5">
                  <FiInfo className="text-emerald-400" /> Formula: {formula}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
            >
              <FiX size={20} />
            </button>
          </div>

          {/* Summary Strip & Search Bar */}
          <div className="p-4 bg-black/40 border-b border-white/10 space-y-3">
            <div className="grid grid-cols-4 gap-3 text-center">
              <div className="p-2.5 rounded-xl bg-surface-2 border border-white/5">
                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block">Documents</span>
                <span className="text-base font-black text-white">{filteredAndSortedDocs.length}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-surface-2 border border-white/5">
                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block">Revenue</span>
                <span className="text-base font-black text-emerald-400">${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-surface-2 border border-white/5">
                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block">Total Dead Cost</span>
                <span className="text-base font-black text-amber-400">${totalDeadCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-surface-2 border border-white/5">
                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block">Net Profit</span>
                <span className="text-base font-black text-purple-400">${totalProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>

            {/* Filter Search Input */}
            <div className="relative">
              <FiSearch className="absolute left-3 top-2.5 text-neutral-500" size={14} />
              <input
                type="text"
                placeholder="Search documents by #, customer name, or status..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-surface-2 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          {/* Sortable & Editable Document Table */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {filteredAndSortedDocs.length === 0 ? (
              <div className="text-center py-12 text-neutral-500 text-sm font-semibold">
                No underlying documents match your search query.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-2 text-neutral-400 font-bold uppercase tracking-wider text-[10px] border-b border-white/10">
                    <tr>
                      {renderSortHeader('Doc #', 'docNum')}
                      {renderSortHeader('Customer / Account', 'customer')}
                      {renderSortHeader('Date', 'date')}
                      {renderSortHeader('Subtotal ($)', 'amount', true)}
                      {renderSortHeader('Dead Cost ($)', 'deadCost', true)}
                      {renderSortHeader('Est. Profit ($)', 'profit', true)}
                      {renderSortHeader('Status', 'status')}
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 bg-black/20">
                    {filteredAndSortedDocs.map((doc: any, i: number) => {
                      const docId = doc.id || doc.zohoId || doc.invoiceNumber || `doc-${i}`
                      const isEditing = editingDocId === docId
                      const docNum = doc.invoiceNumber || doc.salesorder_number || doc.zohoId || `Doc #${i+1}`
                      const docDate = doc.issueDate || doc.date || doc.orderDate || doc.createdAt
                      const lineItems = doc.lineItems || doc.line_items || []

                      return (
                        <React.Fragment key={docId}>
                          <tr className="hover:bg-white/[0.04] transition-colors group">
                            <td className="p-3 font-mono font-bold text-white flex items-center gap-1.5">
                              <FiFileText className="text-blue-400 shrink-0" />
                              <span>{docNum}</span>
                            </td>
                            <td className="p-3 text-neutral-300 font-semibold max-w-xs truncate">
                              {doc.accountName || doc.account?.name || doc.customer_name || "Unknown"}
                            </td>
                            <td className="p-3 text-neutral-400 font-mono text-[11px]">
                              {docDate ? new Date(docDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "-"}
                            </td>
                            
                            {/* Editable or Static Values */}
                            {isEditing ? (
                              <>
                                <td className="p-2 text-right">
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={editForm.amount}
                                    onChange={e => setEditForm({ ...editForm, amount: parseFloat(e.target.value) || 0 })}
                                    className="w-24 bg-neutral-900 border border-purple-500 rounded px-2 py-1 text-right text-xs font-mono text-white"
                                  />
                                </td>
                                <td className="p-2 text-right">
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={editForm.deadCost}
                                    onChange={e => setEditForm({ ...editForm, deadCost: parseFloat(e.target.value) || 0 })}
                                    className="w-24 bg-neutral-900 border border-amber-500 rounded px-2 py-1 text-right text-xs font-mono text-amber-300"
                                  />
                                </td>
                                <td className="p-2 text-right">
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={editForm.profit}
                                    onChange={e => setEditForm({ ...editForm, profit: parseFloat(e.target.value) || 0 })}
                                    className="w-24 bg-neutral-900 border border-emerald-500 rounded px-2 py-1 text-right text-xs font-mono text-emerald-300"
                                  />
                                </td>
                                <td className="p-2">
                                  <input
                                    type="text"
                                    value={editForm.status}
                                    onChange={e => setEditForm({ ...editForm, status: e.target.value })}
                                    className="w-24 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs text-white"
                                  />
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="p-3 text-right font-mono font-bold text-white">
                                  ${(parseFloat(doc.amount || doc.sub_total || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                                <td className="p-3 text-right font-mono text-amber-400">
                                  ${(parseFloat(doc.deadCost || doc.deadCostTotal || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                                <td className="p-3 text-right font-mono font-bold text-emerald-400">
                                  ${(parseFloat(doc.profit || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                                <td className="p-3 text-center">
                                  <span className="px-2 py-0.5 text-[10px] rounded uppercase font-bold bg-neutral-800 text-neutral-300 border border-white/10">
                                    {doc.status || "Completed"}
                                  </span>
                                </td>
                              </>
                            )}

                            {/* Row Action Button */}
                            <td className="p-3 text-right">
                              {isEditing ? (
                                <button
                                  onClick={() => handleSaveEdit(doc)}
                                  disabled={isSaving}
                                  className="p-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors inline-flex items-center gap-1 text-[11px] font-bold"
                                >
                                  {isSaving ? <FiRefreshCw className="animate-spin" size={12} /> : <FiSave size={12} />}
                                  <span>Save</span>
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleStartEdit(doc)}
                                  className="p-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white rounded-lg transition-colors inline-flex items-center gap-1 text-[11px] font-medium"
                                  title="Edit Record Values"
                                >
                                  <FiEdit3 size={12} />
                                  <span>Edit</span>
                                </button>
                              )}
                            </td>
                          </tr>

                          {/* Line Items Detail */}
                          {lineItems.length > 0 && (
                            <tr className="bg-black/40">
                              <td colSpan={8} className="p-3 pl-8">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1.5">Line Items (Click for item details):</div>
                                <div className="flex flex-wrap gap-2">
                                  {lineItems.map((li: any, idx: number) => (
                                    <button
                                      key={idx}
                                      onClick={() => setSelectedLineItem(li)}
                                      className="px-2.5 py-1 bg-surface-2 hover:bg-neutral-800 text-neutral-200 text-[11px] font-medium rounded-lg border border-white/10 transition-colors flex items-center gap-1.5"
                                    >
                                      <span className="font-bold text-emerald-400">{li.quantity || 1}x</span>
                                      <span>{li.name || li.sku}</span>
                                      <span className="text-neutral-500">(${parseFloat(li.rate || 0).toFixed(2)})</span>
                                      <FiChevronRight size={12} className="text-neutral-500" />
                                    </button>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div className="flex justify-end px-6 py-3 border-t border-white/10 bg-surface-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-bold rounded-lg transition-colors border border-white/10"
            >
              Close Breakdown
            </button>
          </div>
        </div>
      </div>

      {/* Line Item Modal */}
      {selectedLineItem && (
        <LineItemModal item={selectedLineItem} onClose={() => setSelectedLineItem(null)} />
      )}
    </>
  )
}
