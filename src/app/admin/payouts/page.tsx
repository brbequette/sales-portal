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
  payouts: any[]
}

export default function PayoutsPage() {
  const { isInitialized, zohoContext: currentUser } = useZoho()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ledger, setLedger] = useState<RepLedger[]>([])
  
  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [showCsvModal, setShowCsvModal] = useState(false)
  const [csvUploadStatus, setCsvUploadStatus] = useState<string | null>(null)
  const [csvErrors, setCsvErrors] = useState<string[]>([])
  
  const [selectedRepId, setSelectedRepId] = useState("")
  const [payoutAmount, setPayoutAmount] = useState("")
  const [payoutMethod, setPayoutMethod] = useState("Check")
  const [payoutNotes, setPayoutNotes] = useState("")
  const [payoutCaughtUp, setPayoutCaughtUp] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const normalizedRole = currentUser?.role?.toLowerCase() || ""
  const isAdmin = normalizedRole.includes("admin") || normalizedRole === "administrator" || normalizedRole.includes("manager")

  const fetchLedger = async () => {
    try {
      setError(null)
      const res = await fetch("/api/get-commissions?includeHidden=true&year=all")
      const data = await res.json()
      if (data.success) {
        const repsArray = Object.values(data.byRep) as RepLedger[]
        // Sort by balance descending
        repsArray.sort((a, b) => b.balance - a.balance)
        setLedger(repsArray)
      } else {
        setError(data.error || "Failed to load ledger")
      }
    } catch (err: any) {
      setError(err.message || "Network error")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!isInitialized) return
    if (!currentUser) {
      router.push("/login")
      return
    }
    if (!isAdmin) {
      router.push("/")
      return
    }
    fetchLedger()
  }, [isInitialized, currentUser, router, isAdmin])

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
          caughtUpTo: payoutCaughtUp
        })
      })
      const data = await res.json()
      if (data.success) {
        setShowModal(false)
        setPayoutAmount("")
        setPayoutNotes("")
        setPayoutCaughtUp("")
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
        const amountStr = row["amount"];
        const method = row["method"] || "Check";
        const caughtUpTo = row["caught up to"] || "";
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

        const amount = parseFloat(amountStr.replace(/[^0-9.-]+/g,""));
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
              notes: notes,
              caughtUpTo: caughtUpTo
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
    const csvContent = "data:text/csv;charset=utf-8,Rep Name,Amount,Method,Caught Up To,Notes\nJohn Doe,500.00,Check,Invoice #1234,Bonus payout\nJane Smith,250.50,Zelle,Dec 15th,Regular commission";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "payouts_example.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white p-4 sm:p-8">
      <div className="max-w-6xl mx-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/admin")}
              className="p-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded-xl transition-colors"
            >
              <FiChevronLeft size={20} className="text-neutral-400" />
            </button>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black bg-gradient-to-r from-purple-400 to-emerald-400 bg-clip-text text-transparent">
                Payouts & Ledger
              </h1>
              <p className="text-sm text-neutral-400 font-medium mt-1">
                Manage sales rep balances, payouts, and commissions.
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => {
                setShowCsvModal(true)
                setCsvUploadStatus(null)
                setCsvErrors([])
              }}
              className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white font-bold rounded-xl transition-all"
            >
              <FiUpload size={16} />
              <span>Upload CSV</span>
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-purple-900/20"
            >
              <FiPlus size={16} />
              <span>Add Payout</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl mb-6 text-sm">
            {error}
          </div>
        )}

        {/* Ledger Table */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead>
                <tr className="bg-neutral-950/50 border-b border-neutral-800 text-neutral-400 uppercase tracking-wider text-xs">
                  <th className="px-6 py-4 font-bold">Rep Name</th>
                  <th className="px-6 py-4 font-bold text-right text-emerald-400">Total Earned</th>
                  <th className="px-6 py-4 font-bold text-right text-neutral-500">Total Paid</th>
                  <th className="px-6 py-4 font-bold text-right text-purple-400 text-base">Balance</th>
                  <th className="px-6 py-4 font-bold text-right text-amber-500">Futures</th>
                  <th className="px-6 py-4 font-bold text-right text-red-400">At Risk (90d+)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/50">
                {ledger.map((rep) => (
                  <tr key={rep.repId} className="hover:bg-neutral-800/20 transition-colors">
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
                    <td className="px-6 py-4 text-right font-mono text-base font-bold text-purple-300 bg-purple-900/10">
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
                {ledger.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-neutral-500 italic">
                      No reps found with commission data.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Add Payout Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-neutral-800">
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
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500 transition-colors"
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
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-8 pr-4 py-3 text-sm text-white font-mono focus:outline-none focus:border-purple-500 transition-colors"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Method</label>
                  <select
                    required
                    value={payoutMethod}
                    onChange={(e) => setPayoutMethod(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500 transition-colors"
                  >
                    <option value="Check">Check</option>
                    <option value="Zelle">Zelle</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Caught up to...</label>
                <input
                  type="text"
                  value={payoutCaughtUp}
                  onChange={(e) => setPayoutCaughtUp(e.target.value)}
                  placeholder="e.g. Invoice #1234 or Dec 15th"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500 transition-colors"
                />
                <p className="text-[10px] text-neutral-500 mt-1">Note how far down the invoice line this gets them caught up with.</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Description / Notes</label>
                <textarea
                  value={payoutNotes}
                  onChange={(e) => setPayoutNotes(e.target.value)}
                  placeholder="Optional notes about this payout"
                  rows={2}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500 transition-colors resize-none"
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
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-neutral-800">
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
              <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800">
                <h3 className="font-bold text-white mb-2 flex items-center gap-2">
                  Format Instructions
                </h3>
                <p className="text-sm text-neutral-400 mb-3">
                  Upload a comma-separated values (.csv) file with the following exact headers (case-insensitive). Rep Name must match exactly as it appears in the ledger.
                </p>
                <div className="bg-black border border-neutral-800 rounded p-3 mb-3 overflow-x-auto">
                  <code className="text-xs text-emerald-400 whitespace-nowrap">
                    Rep Name,Amount,Method,Caught Up To,Notes<br/>
                    John Doe,500.00,Check,Invoice #1234,Bonus payout<br/>
                    Jane Smith,250.50,Zelle,Dec 15th,Regular commission
                  </code>
                </div>
                <button 
                  onClick={downloadExampleCsv}
                  className="text-sm text-purple-400 hover:text-purple-300 flex items-center gap-1 font-bold"
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

    </div>
  )
}
