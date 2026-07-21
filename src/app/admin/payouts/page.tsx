"use client"


import { useZoho } from "@/components/ZohoProvider"
import { useRouter } from "next/navigation"
import { useEffect, useState, useMemo } from "react"
import { FiDollarSign, FiChevronLeft, FiPlus, FiX, FiUpload, FiDownload } from "react-icons/fi"

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== "");
  if (lines.length < 2) return [];

  const parseLine = (line: string) => {
    const result = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' && line[i+1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  };

  const headers = parseLine(lines[0]).map(h => h.trim().toLowerCase());
  const rows = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]).map(v => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || "";
    });
    rows.push(row);
  }
  
  return rows;
}

function formatCurrency(value: number): string {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

interface RepLedger {
  repId: string
  repName: string
  totalEarned: number
  totalPaid: number
  balance: number
  totalFutures: number
  totalAtRisk: number
  invoices: any[]
  payouts: any[]
}

export default function PayoutsPage() {
  const { isInitialized, zohoContext: currentUser } = useZoho()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ledger, setLedger] = useState<RepLedger[]>([])
  const [sortField, setSortField] = useState<keyof RepLedger>("balance")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedYear, setSelectedYear] = useState<string>("all")
  const [availableYears, setAvailableYears] = useState<number[]>([])
  
  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [showCsvModal, setShowCsvModal] = useState(false)
  const [selectedRepForLedger, setSelectedRepForLedger] = useState<RepLedger | null>(null)
  const [csvUploadStatus, setCsvUploadStatus] = useState<string | null>(null)
  const [csvErrors, setCsvErrors] = useState<string[]>([])
  
  const [selectedRepId, setSelectedRepId] = useState("")
  const [payoutAmount, setPayoutAmount] = useState("")
  const [payoutMethod, setPayoutMethod] = useState("Check")
  const [payoutNotes, setPayoutNotes] = useState("")
  const [payoutDate, setPayoutDate] = useState(new Date().toISOString().split('T')[0])
  const [submitting, setSubmitting] = useState(false)

  const normalizedRole = currentUser?.role?.toLowerCase() || ""
  const isAdmin = normalizedRole.includes("admin") || normalizedRole === "administrator" || normalizedRole.includes("manager")

  const fetchLedger = async () => {
    try {
      setError(null)
      setLoading(true)
      const res = await fetch(`/api/get-commissions?includeHidden=true&year=${selectedYear}`)
      const data = await res.json()
      if (data.success) {
        const repsArray = Object.values(data.byRep) as RepLedger[]
        // Sort by balance descending
        repsArray.sort((a, b) => b.balance - a.balance)
        setLedger(repsArray)
        if (data.years && data.years.length > 0) {
          setAvailableYears(data.years)
        }
      } else {
        setError(data.error || "Failed to load ledger")
      }
    } catch (err: any) {
      setError(err.message || "Network error")
    } finally {
      setLoading(false)
    }
  }

  const handleSort = (field: keyof RepLedger) => {
    if (sortField === field) {
      setSortDir(prev => prev === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDir("desc")
    }
  }

  const processedLedger = useMemo(() => {
    let filtered = ledger
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter(r => r.repName.toLowerCase().includes(q))
    }
    return filtered.sort((a, b) => {
      let aVal = a[sortField]
      let bVal = b[sortField]
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
      }
      aVal = (aVal as number) || 0
      bVal = (bVal as number) || 0
      return sortDir === "asc" ? aVal - bVal : bVal - aVal
    })
  }, [ledger, sortField, sortDir, searchQuery])

  const transactionLedger = useMemo(() => {
    if (!selectedRepForLedger) return []
    
    type Transaction = {
      id: string
      date: string
      type: "commission" | "payout"
      description: string
      amount: number
    }
    
    const txs: Transaction[] = []
    
    // Add all commissions
    for (const inv of (selectedRepForLedger.invoices || [])) {
      if (inv.commission && inv.commission.total > 0) {
        txs.push({
          id: `inv-${inv.id}`,
          date: inv.issueDate,
          type: "commission",
          description: inv.name || `Invoice ${inv.invoiceNumber}`,
          amount: inv.commission.total
        })
      }
    }
    
    // Add all payouts
    for (const payout of (selectedRepForLedger.payouts || [])) {
      txs.push({
        id: `pay-${payout.id}`,
        date: payout.date || payout.createdAt,
        type: "payout",
        description: `Payout (${payout.method})${payout.notes ? ` - ${payout.notes}` : ''}`,
        amount: -payout.amount
      })
    }
    
    // Sort chronologically ascending
    txs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    
    // Calculate running balance
    let runningBalance = 0
    return txs.map(tx => {
      runningBalance += tx.amount
      return { ...tx, runningBalance }
    })
  }, [selectedRepForLedger])

  useEffect(() => {
    fetchLedger()
  }, [selectedYear])

  const handleAddPayout = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedRepId || !payoutAmount) return

    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch("/api/add-payout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repId: selectedRepId,
          amount: payoutAmount,
          method: payoutMethod,
          notes: payoutNotes,
          date: payoutDate
        })
      })
      const data = await res.json()
      if (data.success) {
        setShowModal(false)
        setPayoutAmount("")
        setPayoutNotes("")
        setPayoutDate(new Date().toISOString().split('T')[0])
        setPayoutMethod("Check")
        // Refresh the ledger
        fetchLedger()
      } else {
        setError(data.error || "Failed to add payout")
      }
    } catch (err: any) {
      setError(err.message || "Network error")
    } finally {
      setSubmitting(false)
    }
  }

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    setSubmitting(true);
    setCsvUploadStatus("Parsing CSV...");
    setCsvErrors([]);

    try {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length === 0) {
        setCsvErrors(["CSV is empty or invalid."]);
        setSubmitting(false);
        return;
      }

      setCsvUploadStatus(`Found ${rows.length} rows. Uploading...`);
      let successCount = 0;
      let newErrors: string[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const repName = row["rep name"];
        const amountStr = row["amount"] || "";
        const amount = parseFloat(amountStr.replace(/[^0-9.-]+/g, ""));
        const method = row["method"] || "Check";
        const payoutDateStr = row["payout date"] || "";
        const notes = row["notes"] || "";

        if (!repName || !amountStr) {
          newErrors.push(`Row ${i + 2}: Missing Rep Name or Amount.`);
          continue;
        }

        // Find repId
        const rep = ledger.find(r => r.repName.toLowerCase() === repName.toLowerCase());
        if (!rep) {
          newErrors.push(`Row ${i + 2}: Rep '${repName}' not found in ledger.`);
          continue;
        }

        if (isNaN(amount) || amount <= 0) {
          newErrors.push(`Row ${i + 2}: Invalid amount '${amountStr}'.`);
          continue;
        }

        try {
          const res = await fetch("/api/add-payout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              repId: rep.repId,
              amount: amount.toString(),
              method: method,
              date: payoutDateStr || new Date().toISOString().split('T')[0],
              notes: notes
            })
          });
          const data = await res.json();
          if (!data.success) {
            newErrors.push(`Row ${i + 2}: Backend error - ${data.error}`);
          } else {
            successCount++;
          }
        } catch (err: any) {
          newErrors.push(`Row ${i + 2}: Network error - ${err.message}`);
        }
      }

      setCsvErrors(newErrors);
      setCsvUploadStatus(`Completed! Successfully added ${successCount} payouts. ${newErrors.length > 0 ? "See errors below." : ""}`);
      if (successCount > 0) {
        fetchLedger();
      }
    } catch (error: any) {
      setCsvErrors([`Failed to parse file: ${error.message}`]);
    } finally {
      setSubmitting(false);
      // Reset file input
      e.target.value = '';
    }
  };

  const downloadExampleCsv = () => {
    const csvContent = "data:text/csv;charset=utf-8,Rep Name,Amount,Method,Payout Date,Notes\nJohn Doe,500.00,Check,2023-11-01,Bonus payout\nJane Smith,250.50,Zelle,2023-12-15,Regular commission";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "payouts_example.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  if (loading && ledger.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-[#0f1013]">
        <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  return (
    <div className="flex flex-col text-neutral-100 font-sans h-full">
      <main className="flex-1 p-4 sm:p-6 space-y-6 overflow-y-auto safe-bottom">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <FiDollarSign className="text-emerald-500" /> Commission Ledger
            </h1>
            <p className="text-xs text-neutral-400 mt-1">Track balances, view invoices, and manage payouts</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowCsvModal(true)}
              className="px-4 py-2 glass-panel border border-neutral-700 hover:bg-white/10 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 text-white rounded-lg text-sm font-bold flex items-center gap-2 transition-colors"
            >
              <FiUpload /> Import CSV
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-bold flex items-center gap-2 transition-colors shadow-lg shadow-emerald-900/20"
            >
              <FiPlus /> New Payout
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl mb-6 text-sm">
            {error}
          </div>
        )}

        <div className="mb-6 flex flex-col sm:flex-row gap-4 items-center justify-between glass-panel p-4 border border-white/10 rounded-2xl">
          <div className="flex gap-4 w-full sm:w-auto">
            <input
              type="text"
              placeholder="Search by rep name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full sm:w-64 bg-black/20 border border-white/10 text-white rounded-xl px-4 py-2 focus:outline-none focus:border-purple-500 transition-colors"
            />
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="bg-black/20 border border-white/10 text-white rounded-xl px-4 py-2 focus:outline-none focus:border-purple-500 transition-colors"
            >
              <option value="all">All Time</option>
              {availableYears.map(y => (
                <option key={y} value={y.toString()}>{y}</option>
              ))}
            </select>
          </div>
          <div className="text-sm text-neutral-400">
            Showing {processedLedger.length} of {ledger.length} reps
          </div>
        </div>

        {/* Ledger Table */}
        <div className="glass-panel border border-white/10 rounded-2xl overflow-hidden shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead>
                <tr className="bg-black/20/50 border-b border-white/10 text-neutral-400 uppercase tracking-wider text-xs select-none">
                  <th className="px-6 py-4 font-bold cursor-pointer hover:bg-white/10 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300/50 transition-colors" onClick={() => handleSort("repName")}>
                    Rep Name {sortField === "repName" && (sortDir === "asc" ? "â†‘" : "â†“")}
                  </th>
                  <th className="px-6 py-4 font-bold text-right text-emerald-400 cursor-pointer hover:bg-white/10 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300/50 transition-colors" onClick={() => handleSort("totalEarned")}>
                    Total Earned {sortField === "totalEarned" && (sortDir === "asc" ? "â†‘" : "â†“")}
                  </th>
                  <th className="px-6 py-4 font-bold text-right text-neutral-500 cursor-pointer hover:bg-white/10 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300/50 transition-colors" onClick={() => handleSort("totalPaid")}>
                    Total Paid {sortField === "totalPaid" && (sortDir === "asc" ? "â†‘" : "â†“")}
                  </th>
                  <th className="px-6 py-4 font-bold text-right text-purple-400 text-base cursor-pointer hover:bg-white/10 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300/50 transition-colors" onClick={() => handleSort("balance")}>
                    Balance {sortField === "balance" && (sortDir === "asc" ? "â†‘" : "â†“")}
                  </th>
                  <th className="px-6 py-4 font-bold text-right text-amber-500 cursor-pointer hover:bg-white/10 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300/50 transition-colors" onClick={() => handleSort("totalFutures")}>
                    Futures {sortField === "totalFutures" && (sortDir === "asc" ? "â†‘" : "â†“")}
                  </th>
                  <th className="px-6 py-4 font-bold text-right text-red-400 cursor-pointer hover:bg-white/10 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300/50 transition-colors" onClick={() => handleSort("totalAtRisk")}>
                    At Risk (90d+) {sortField === "totalAtRisk" && (sortDir === "asc" ? "â†‘" : "â†“")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/50">
                {processedLedger.map((rep) => (
                  <tr key={rep.repId} className="hover:bg-white/10 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300/20 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-bold text-white">{rep.repName}</div>
                      <div className="text-[10px] text-neutral-500 mt-0.5">{rep.payouts?.length || 0} Payouts</div>
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-emerald-300">
                      {formatCurrency(rep.totalEarned)}
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-neutral-400">
                      {formatCurrency(rep.totalPaid)}
                    </td>
                    <td 
                      className="px-6 py-4 text-right font-mono text-base font-bold text-purple-300 bg-purple-900/10 cursor-pointer hover:bg-purple-900/30 transition-colors underline decoration-purple-500/50 underline-offset-4"
                      onClick={() => setSelectedRepForLedger(rep)}
                    >
                      {formatCurrency(rep.balance)}
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-amber-300">
                      {formatCurrency(rep.totalFutures || 0)}
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-red-400">
                      {formatCurrency(rep.totalAtRisk || 0)}
                    </td>
                  </tr>
                ))}
                {processedLedger.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-neutral-500 italic">
                      No reps found with commission data.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      {/* Add Payout Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="glass-panel border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-white/10">
              <h2 className="text-xl font-black text-white">Add Payout</h2>
              <button 
                onClick={() => setShowModal(false)}
                className="p-2 text-neutral-400 hover:text-white bg-neutral-800/50 hover:bg-neutral-700 rounded-xl transition-colors"
              >
                <FiX size={20} />
              </button>
            </div>
            <form onSubmit={handleAddPayout} className="p-4 sm:p-6 space-y-4">
              
              <div>
                <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Sales Rep</label>
                <select
                  required
                  value={selectedRepId}
                  onChange={(e) => setSelectedRepId(e.target.value)}
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500 transition-colors"
                >
                  <option value="">-- Select Rep --</option>
                  {ledger.map(r => (
                    <option key={r.repId} value={r.repId}>
                      {r.repName} (Balance: {formatCurrency(r.balance)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Amount</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500 font-bold">$</span>
                    <input
                      type="number"
                      required
                      step="0.01"
                      min="0"
                      value={payoutAmount}
                      onChange={(e) => setPayoutAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-black/20 border border-white/10 rounded-xl pl-8 pr-4 py-3 text-sm text-white font-mono focus:outline-none focus:border-purple-500 transition-colors"
                    />
                  </div>
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Payout Date</label>
                  <input
                    type="date"
                    value={payoutDate}
                    onChange={(e) => setPayoutDate(e.target.value)}
                    className="w-full glass-panel border border-white/10 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Method</label>
                <select
                  required
                  value={payoutMethod}
                  onChange={(e) => setPayoutMethod(e.target.value)}
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500 transition-colors"
                >
                  <option value="Check">Check</option>
                  <option value="Zelle">Zelle</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Description / Notes</label>
                <textarea
                  value={payoutNotes}
                  onChange={(e) => setPayoutNotes(e.target.value)}
                  placeholder="Optional notes about this payout"
                  rows={2}
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500 transition-colors resize-none"
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-5 py-2.5 text-sm font-bold text-neutral-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !selectedRepId || !payoutAmount}
                  className="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-purple-900/20"
                >
                  {submitting ? "Saving..." : "Add Payout"}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Upload CSV Modal */}
      {showCsvModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="glass-panel border border-white/10 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-white/10">
              <h2 className="text-xl font-black text-white">Upload Payouts via CSV</h2>
              <button 
                onClick={() => setShowCsvModal(false)}
                className="p-2 text-neutral-400 hover:text-white bg-neutral-800/50 hover:bg-neutral-700 rounded-xl transition-colors"
                disabled={submitting}
              >
                <FiX size={20} />
              </button>
            </div>
            <div className="p-4 sm:p-6 space-y-6">
              
              {/* Instructions */}
              <div className="bg-black/20 p-4 rounded-xl border border-white/10">
                <h3 className="font-bold text-white mb-2 flex items-center gap-2">
                  Format Instructions
                </h3>
                <p className="text-sm text-neutral-400 mb-3">
                  Upload a comma-separated values (.csv) file with the following exact headers (case-insensitive). Rep Name must match exactly as it appears in the ledger.
                </p>
                <p className="mt-2 font-mono bg-black/20 p-3 rounded-lg border border-white/10 text-neutral-400 text-xs">
                  Format:<br/>
                  Rep Name,Amount,Method,Payout Date,Notes<br/>
                  <span className="text-neutral-500">John Doe,500,Check,2023-11-01,Bonus payout</span>
                </p>
                <button 
                  onClick={downloadExampleCsv}
                  className="text-sm text-purple-400 hover:text-purple-300 flex items-center gap-1 font-bold mt-4"
                >
                  <FiDownload size={14} /> Download Example Template
                </button>
              </div>

              {/* Upload Input */}
              <div>
                <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Select CSV File</label>
                <input 
                  type="file" 
                  accept=".csv"
                  onChange={handleCsvUpload}
                  disabled={submitting}
                  className="w-full text-sm text-neutral-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-purple-600 file:text-white hover:file:bg-purple-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>

              {/* Status and Errors */}
              {csvUploadStatus && (
                <div className={`p-4 rounded-xl text-sm font-bold ${csvErrors.length > 0 ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                  {csvUploadStatus}
                </div>
              )}

              {csvErrors.length > 0 && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 max-h-40 overflow-y-auto">
                  <h4 className="text-sm font-bold text-red-400 mb-2">Errors:</h4>
                  <ul className="list-disc list-inside text-xs text-red-300 space-y-1">
                    {csvErrors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* Transaction Ledger Modal */}
      {selectedRepForLedger && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="glass-panel border border-white/10 rounded-2xl w-full max-w-4xl max-h-[90vh] shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-white/10 shrink-0">
              <div>
                <h2 className="text-xl font-black text-white">Transaction Ledger</h2>
                <p className="text-sm text-neutral-400 mt-1">Showing all history for <span className="font-bold text-purple-400">{selectedRepForLedger.repName}</span></p>
              </div>
              <button 
                onClick={() => setSelectedRepForLedger(null)}
                className="p-2 text-neutral-400 hover:text-white bg-neutral-800/50 hover:bg-neutral-700 rounded-xl transition-colors"
              >
                <FiX size={20} />
              </button>
            </div>
            
            <div className="overflow-y-auto flex-1 p-4 sm:p-6">
              <div className="bg-black/20 border border-white/10 rounded-xl overflow-hidden">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead>
                    <tr className="glass-panel border-b border-white/10 text-neutral-400 uppercase tracking-wider text-xs select-none">
                      <th className="px-6 py-4 font-bold">Date</th>
                      <th className="px-6 py-4 font-bold w-full">Description</th>
                      <th className="px-6 py-4 font-bold text-right">Amount</th>
                      <th className="px-6 py-4 font-bold text-right text-purple-400">Running Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/50">
                    {transactionLedger.map((tx, i) => (
                      <tr key={`${tx.id}-${i}`} className="hover:glass-panel/50 transition-colors">
                        <td className="px-6 py-3 text-neutral-300 font-mono text-xs">
                          {new Date(tx.date).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${tx.type === 'commission' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                              {tx.type}
                            </span>
                            <span className="text-white truncate max-w-sm" title={tx.description}>{tx.description}</span>
                          </div>
                        </td>
                        <td className={`px-6 py-3 text-right font-mono ${tx.amount > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {tx.amount > 0 ? '+' : ''}{formatCurrency(tx.amount)}
                        </td>
                        <td className="px-6 py-3 text-right font-mono font-bold text-purple-300 bg-purple-900/5">
                          {formatCurrency(tx.runningBalance)}
                        </td>
                      </tr>
                    ))}
                    {transactionLedger.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-6 py-8 text-center text-neutral-500 italic">
                          No transactions found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            
            <div className="p-4 sm:p-6 border-t border-white/10 glass-panel shrink-0 flex justify-end items-center gap-4">
              <div className="text-sm text-neutral-400 uppercase tracking-wider font-bold">Current Balance</div>
              <div className="text-2xl font-black text-purple-400 font-mono">
                {formatCurrency(selectedRepForLedger.balance)}
              </div>
            </div>
          </div>
        </div>
      )}
      </main>
    </div>
  )
}

