"use client"


import { createPortal } from "react-dom"
import { FiSearch, FiPlus, FiUserPlus, FiCheckSquare, FiFileText, FiDollarSign, FiBox, FiClock, FiTrendingUp, FiAlertCircle, FiList, FiCheck, FiCalendar, FiCheckCircle, FiX, FiArrowLeft } from "react-icons/fi"
import Link from "next/link"
import { toast } from "react-hot-toast"
import { TaskModal } from "@/components/TaskModal"
import { NotificationCenter } from "@/components/NotificationCenter"
import { useGlobalTopBarData } from "./useGlobalTopBarData"

export function GlobalTopBar() {
  const {
    router, currentUser, preferences, updatePreferences,
    campaignState, cancelCampaign,
    
    query, setQuery, results, loading, showResults, setShowResults, isMobile,
    showAddTaskModal, setShowAddTaskModal, showTaskDrawer, setShowTaskDrawer, taskDrawerTab, setTaskDrawerTab, topBarTasks,
    searchRef, timeEntry, geoStatus, clockLoading, monitorStatus,
    autoClockToast, showClockInPrompt, stripStats,
    
    fetchTopBarTasks, handleResultClick, calculateHours, handleToggleClock, dismissClockInPrompt, handlePromptClockIn
  } = useGlobalTopBarData()

  return (
    <>
    {/* Single sticky wrapper — contains impersonation banner, topbar, and stats strip.
        This ensures the stats strip always renders directly below the topbar,
        regardless of whether the impersonation banner is visible. */}
    <div className="sticky top-0 z-40 flex flex-col">
    {preferences.impersonatedUser && (
      <div className="bg-amber-500/20 border-b border-amber-500/30 text-amber-200 px-4 py-2 flex items-center justify-center gap-3 text-sm font-bold relative">
        <FiUserPlus size={16} />
        <span>Viewing as {preferences.impersonatedUser.name}</span>
        <button
          onClick={() => updatePreferences({ impersonatedUser: null })}
          className="bg-amber-500 hover:bg-amber-400 text-black px-3 py-1 rounded shadow-lg transition-colors ml-2"
        >
          Exit Impersonation
        </button>
      </div>
    )}
    <div className="glass-panel border-x-0 border-t-0 px-4 py-3 flex items-center justify-between rounded-none shadow-lg">
      
      {/* Left side: Search */}
      <div className="flex-1 max-w-2xl relative" ref={searchRef}>
        <div className="relative">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={16} />
          <input 
            type="text" 
            placeholder="Search accounts, invoices, products, quotes..." 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => { if (results) setShowResults(true) }}
            className="w-full bg-white/[0.035] border border-white/10 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-[var(--primary)] focus:bg-white/[0.055] transition-colors"
          />
          {loading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin"></div>
          )}
        </div>

        {/* Desktop Dropdown Results */}
        {!isMobile && showResults && results && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-surface border border-white/10 rounded-xl shadow-[0_22px_70px_rgba(0,0,0,0.45)] overflow-hidden max-h-[80vh] overflow-y-auto z-50">
            {Object.keys(results).every(k => results[k].length === 0) ? (
              <div className="p-4 text-center text-sm text-neutral-500">No results found for &quot;{query}&quot;</div>
            ) : (
              <div className="py-2">
                {results.accounts?.length > 0 && (
                  <div className="mb-2">
                    <div className="px-4 py-1 text-[10px] font-bold text-neutral-500 uppercase tracking-wider bg-black/20">Accounts</div>
                    {results.accounts.map((a: any) => (
                      <div 
                        key={a.id} 
                        onClick={() => handleResultClick("accounts", a)}
                        className="px-4 py-2 hover:bg-white/[0.055] cursor-pointer flex items-center gap-3 transition-colors"
                      >
                        <div className="w-8 h-8 rounded bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
                          <FiUserPlus />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-white truncate">{a.name}</div>
                          <div className="text-xs text-neutral-500 truncate">{a.zohoId} - {a.industry || "No Industry"}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {results.invoices?.length > 0 && (
                  <div className="mb-2">
                    <div className="px-4 py-1 text-[10px] font-bold text-neutral-500 uppercase tracking-wider bg-black/20">Invoices, Orders & Quotes</div>
                    {results.invoices.map((i: any) => (
                      <div 
                        key={i.id} 
                        onClick={() => handleResultClick("invoices", i)}
                        className="px-4 py-2 hover:bg-white/[0.055] cursor-pointer flex items-center gap-3 transition-colors"
                      >
                        <div className="w-8 h-8 rounded bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0">
                          <FiFileText />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-bold text-white truncate">{i.invoiceNumber || i.items?.invoiceNumber || i.items?.invoice_number || i.items?.estimate_number || i.items?.salesorder_number || "Draft"}</div>
                          <div className="text-xs text-neutral-500 truncate">{i.docType ? `${i.docType} . ` : ""}{i.status}{i.accountName ? ` . ${i.accountName}` : ""}</div>
                        </div>
                        <div className="text-sm font-bold text-emerald-400">${parseFloat(i.amount).toFixed(2)}</div>
                      </div>
                    ))}
                  </div>
                )}

                {results.deals?.length > 0 && (
                  <div className="mb-2">
                    <div className="px-4 py-1 text-[10px] font-bold text-neutral-500 uppercase tracking-wider bg-black/20">Deals & Quotes</div>
                    {results.deals.map((d: any) => (
                      <div 
                        key={d.id} 
                        onClick={() => handleResultClick("deals", d)}
                        className="px-4 py-2 hover:bg-white/[0.055] cursor-pointer flex items-center gap-3 transition-colors"
                      >
                        <div className="w-8 h-8 rounded bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
                          <FiDollarSign />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-bold text-white truncate">{d.name}</div>
                          <div className="text-xs text-neutral-500 truncate">{d.stage}</div>
                        </div>
                        <div className="text-sm font-bold text-emerald-400">${parseFloat(d.amount).toFixed(2)}</div>
                      </div>
                    ))}
                  </div>
                )}

                {results.products?.length > 0 && (
                  <div className="mb-0">
                    <div className="px-4 py-1 text-[10px] font-bold text-neutral-500 uppercase tracking-wider bg-black/20">Products</div>
                    {results.products.map((p: any) => (
                      <div 
                        key={p.id || p.sku} 
                        onClick={() => handleResultClick("products", p)}
                        className="px-4 py-2 hover:bg-white/[0.055] cursor-pointer flex items-center gap-3 transition-colors"
                      >
                        <div className="w-8 h-8 rounded bg-purple-500/10 text-purple-400 flex items-center justify-center shrink-0">
                          <FiBox />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-bold text-white truncate">{p.name}</div>
                          <div className="text-xs text-neutral-500 truncate">{p.sku}</div>
                        </div>
                        <div className="text-sm font-bold text-white">${parseFloat(p.price || 0).toFixed(2)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mobile Full-Screen Search Results Portal */}
      {isMobile && showResults && results && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[400] flex flex-col" style={{ background: 'rgba(10,10,12,0.98)' }}>
          {/* Header bar */}
          <div className="flex items-center gap-3 px-4 py-3 bg-surface border-b border-white/10" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
            <button
              onClick={() => { setShowResults(false); setQuery('') }}
              className="flex items-center justify-center w-9 h-9 rounded-xl bg-white/[0.07] text-neutral-300 shrink-0"
            >
              <FiArrowLeft size={18} />
            </button>
            <div className="relative flex-1">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={15} />
              <input
                type="text"
                autoFocus
                placeholder="Search accounts, invoices, products..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="w-full bg-white/[0.055] border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-rose-500 transition-colors"
              />
              {loading && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
              )}
            </div>
          </div>

          {/* Results list */}
          <div className="flex-1 overflow-y-auto">
            {Object.keys(results).every(k => results[k].length === 0) ? (
              <div className="p-8 text-center">
                <div className="text-4xl mb-3">🔍</div>
                <p className="text-sm text-neutral-400 font-medium">No results for <span className="text-white">&quot;{query}&quot;</span></p>
                <p className="text-xs text-neutral-600 mt-1">Try searching by name, invoice number, or SKU</p>
              </div>
            ) : (
              <div className="py-1">
                {results.accounts?.length > 0 && (
                  <div>
                    <div className="px-4 py-2 text-[10px] font-black text-neutral-500 uppercase tracking-widest bg-black/40 sticky top-0 backdrop-blur">Accounts</div>
                    {results.accounts.map((a: any) => (
                      <div key={a.id} onClick={() => handleResultClick('accounts', a)}
                        className="flex items-center gap-4 px-4 py-3.5 border-b border-white/5 active:bg-white/5 cursor-pointer">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0"><FiUserPlus size={18} /></div>
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-white truncate">{a.name}</div>
                          <div className="text-xs text-neutral-500 truncate">{a.zohoId} · {a.industry || 'No Industry'}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {results.invoices?.length > 0 && (
                  <div>
                    <div className="px-4 py-2 text-[10px] font-black text-neutral-500 uppercase tracking-widest bg-black/40 sticky top-0 backdrop-blur">Invoices & Orders</div>
                    {results.invoices.map((i: any) => (
                      <div key={i.id} onClick={() => handleResultClick('invoices', i)}
                        className="flex items-center gap-4 px-4 py-3.5 border-b border-white/5 active:bg-white/5 cursor-pointer">
                        <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0"><FiFileText size={18} /></div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-bold text-white truncate">{i.invoiceNumber || i.items?.invoice_number || i.items?.salesorder_number || 'Draft'}</div>
                          <div className="text-xs text-neutral-500 truncate">{i.docType ? `${i.docType} · ` : ''}{i.status}{i.accountName ? ` · ${i.accountName}` : ''}</div>
                        </div>
                        <div className="text-sm font-black text-emerald-400 shrink-0">${parseFloat(i.amount).toFixed(2)}</div>
                      </div>
                    ))}
                  </div>
                )}
                {results.deals?.length > 0 && (
                  <div>
                    <div className="px-4 py-2 text-[10px] font-black text-neutral-500 uppercase tracking-widest bg-black/40 sticky top-0 backdrop-blur">Deals</div>
                    {results.deals.map((d: any) => (
                      <div key={d.id} onClick={() => handleResultClick('deals', d)}
                        className="flex items-center gap-4 px-4 py-3.5 border-b border-white/5 active:bg-white/5 cursor-pointer">
                        <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0"><FiDollarSign size={18} /></div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-bold text-white truncate">{d.name}</div>
                          <div className="text-xs text-neutral-500 truncate">{d.stage}</div>
                        </div>
                        <div className="text-sm font-black text-emerald-400 shrink-0">${parseFloat(d.amount).toFixed(2)}</div>
                      </div>
                    ))}
                  </div>
                )}
                {results.products?.length > 0 && (
                  <div>
                    <div className="px-4 py-2 text-[10px] font-black text-neutral-500 uppercase tracking-widest bg-black/40 sticky top-0 backdrop-blur">Products</div>
                    {results.products.map((p: any) => (
                      <div key={p.id || p.sku} onClick={() => handleResultClick('products', p)}
                        className="flex items-center gap-4 px-4 py-3.5 border-b border-white/5 active:bg-white/5 cursor-pointer">
                        <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center shrink-0"><FiBox size={18} /></div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-bold text-white truncate">{p.name}</div>
                          <div className="text-xs text-neutral-500 truncate">{p.sku}</div>
                        </div>
                        <div className="text-sm font-black text-white shrink-0">${parseFloat(p.price || 0).toFixed(2)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Right side: Quick Add Actions */}
      <div className="flex items-center gap-2 lg:gap-3 ml-4 shrink-0">
        
        {/* Timeclock Toggle Widget */}
        <div className="relative flex items-center rounded-lg border border-white/10 bg-white/[0.045] overflow-hidden text-xs lg:text-sm h-10 lg:h-9">
          {/* Geofence monitor indicator */}
          {monitorStatus === 'monitoring' && (
            <div className="flex items-center px-2 h-full border-r border-white/10 bg-blue-500/10" title="Auto-tracking active -- GPS monitoring for clock-in/out">
              <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shadow-[0_0_8px_rgba(96,165,250,0.6)]" />
            </div>
          )}
          {monitorStatus === 'denied' && (
            <div className="flex items-center px-2 h-full border-r border-white/10 bg-red-500/5" title="GPS permission denied -- auto-tracking disabled">
              <div className="w-2 h-2 rounded-full bg-red-500/60" />
            </div>
          )}
          <button
            onClick={handleToggleClock}
            disabled={clockLoading}
            className={`px-3 lg:px-4 h-full font-bold transition-all flex items-center gap-2 border-r border-white/10 ${
              clockLoading
                ? "bg-neutral-700/30 text-neutral-500 cursor-wait"
                : (!timeEntry || timeEntry.manualClockOut)
                  ? "bg-red-500/20 text-red-400 hover:bg-red-500/30" 
                  : "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
            }`}
          >
            <FiClock size={14} className={clockLoading ? "animate-spin" : ""} /> 
            <span className="hidden sm:inline">
              {clockLoading ? "Locating..." : (!timeEntry || timeEntry.manualClockOut) ? "Clock In" : "Clock Out"}
            </span>
          </button>
          
          {timeEntry && (
            <div className="hidden sm:flex items-center gap-1.5 px-3 h-full border-r border-white/10 bg-black/20" title={timeEntry.active ? "Currently Active" : "Inactive for > 20m"}>
              <span className="text-[10px] uppercase font-bold text-neutral-400">
                {timeEntry.active ? "Active" : "Away"}
              </span>
              <div className={`w-2 h-2 rounded-full ${timeEntry.active ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]"}`} />
            </div>
          )}

          <button 
            onClick={() => router.push("/timeclock")}
            className="px-3 lg:px-4 h-full hover:bg-white/[0.075] text-neutral-300 hover:text-white transition-all font-mono"
            title="View Timeclock"
          >
            {calculateHours(timeEntry)}h
          </button>

          {/* Geofence status badge */}
          {geoStatus && (
            <div className={`px-2 py-0.5 text-[10px] font-bold border-l whitespace-nowrap hidden xl:block ${
              geoStatus.status === 'VERIFIED'
                ? 'bg-emerald-900/90 text-emerald-300 border-emerald-500/30'
                : geoStatus.status === 'OUT_OF_RANGE'
                  ? 'bg-amber-900/90 text-amber-300 border-amber-500/30'
                  : 'bg-neutral-800/90 text-neutral-400 border-neutral-600/30'
            }`}>
              {geoStatus.status === 'VERIFIED' && (geoStatus.location || 'On-Site')}
              {geoStatus.status === 'OUT_OF_RANGE' && 'Out of Range'}
              {geoStatus.status === 'DENIED' && 'GPS Denied'}
              {geoStatus.status === 'UNAVAILABLE' && 'GPS Unavailable'}
            </div>
          )}

          {/* Auto-clock toast */}
          {autoClockToast && (
            <div className="absolute -bottom-9 left-0 right-0 mx-auto w-max px-3 py-1.5 rounded-md text-[10px] font-bold shadow-lg border z-50 bg-blue-900/90 text-blue-300 border-blue-500/30 animate-pulse">
              {autoClockToast}
            </div>
          )}
        </div>
        
        {/* Notifications Dropdown */}
        <NotificationCenter />


        {/* Task List Button with Glowing Visual Badge */}
        {(() => {
          const nowTime = new Date()
          const overdueTasksList = topBarTasks.filter(t => {
            if (t.status === "Completed") return false
            if (!t.dueDate) return true
            return new Date(t.dueDate) <= nowTime
          })
          const pendingTasksList = topBarTasks.filter(t => t.status !== "Completed")
          const completedTasksList = topBarTasks.filter(t => t.status === "Completed")

          const overdueCount = overdueTasksList.length
          const pendingCount = pendingTasksList.length

          const drawerDisplayedTasks = taskDrawerTab === "due"
            ? overdueTasksList
            : taskDrawerTab === "completed"
              ? completedTasksList
              : pendingTasksList

          return (
            <>
              <button
                onClick={() => setShowTaskDrawer(true)}
                className="relative hidden sm:flex bg-white/[0.045] hover:bg-white/[0.075] text-neutral-300 hover:text-white font-bold px-3 lg:px-4 py-2 rounded-lg text-xs lg:text-sm transition-all items-center gap-2 border border-white/10 cursor-pointer"
                title="Click to view task list and due reminders"
              >
                <FiList size={14} className="text-sky-400" /> 
                <span className="hidden sm:inline">Tasks</span>
                {overdueCount > 0 ? (
                  <span className="ml-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-black bg-rose-500 text-white shadow-[0_0_10px_rgba(244,63,94,0.6)] animate-pulse">
                    {overdueCount} Due
                  </span>
                ) : pendingCount > 0 ? (
                  <span className="ml-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30">
                    {pendingCount}
                  </span>
                ) : null}
              </button>

              <button
                onClick={() => setShowAddTaskModal(true)}
                className="hidden sm:flex bg-white/[0.045] hover:bg-white/[0.075] text-neutral-300 hover:text-white font-bold px-3 lg:px-4 py-2 rounded-lg text-xs lg:text-sm transition-all items-center gap-2 border border-white/10 cursor-pointer"
              >
                <FiPlus size={14} className="text-emerald-400" /> <span className="hidden sm:inline">Add Task</span>
              </button>

              {/* Task List Slide-over Drawer */}
              {showTaskDrawer && typeof window !== "undefined" && createPortal(
                <div className="fixed inset-0 z-50 flex justify-end">
                  <div 
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" 
                    onClick={() => setShowTaskDrawer(false)} 
                  />

                  <div className="relative w-full max-w-md bg-neutral-900 border-l border-white/10 shadow-2xl z-50 flex flex-col h-full overflow-hidden">
                    {/* Header */}
                    <div className="p-4 border-b border-white/10 flex items-center justify-between bg-neutral-950/80">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
                          <FiCheckSquare size={20} />
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                            <span>Task List & Reminders</span>
                            {overdueCount > 0 && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-500 text-white animate-pulse">
                                {overdueCount} Due
                              </span>
                            )}
                          </h3>
                          <p className="text-xs text-neutral-400 mt-0.5">
                            {pendingCount} total pending task{pendingCount !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setShowAddTaskModal(true)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all flex items-center gap-1 shadow-md cursor-pointer"
                        >
                          <FiPlus size={13} />
                          <span>Add</span>
                        </button>
                        <button
                          onClick={() => setShowTaskDrawer(false)}
                          className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer"
                        >
                          <FiX size={18} />
                        </button>
                      </div>
                    </div>

                    {/* Tabs */}
                    <div className="px-4 py-2.5 bg-neutral-900/90 border-b border-white/5 flex items-center gap-1.5 text-xs">
                      <button
                        onClick={() => setTaskDrawerTab("due")}
                        className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                          taskDrawerTab === "due"
                            ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                            : "text-neutral-400 hover:text-white hover:bg-white/5"
                        }`}
                      >
                        Due / Overdue ({overdueCount})
                      </button>
                      <button
                        onClick={() => setTaskDrawerTab("all")}
                        className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                          taskDrawerTab === "all"
                            ? "bg-sky-500/20 text-sky-300 border border-sky-500/40"
                            : "text-neutral-400 hover:text-white hover:bg-white/5"
                        }`}
                      >
                        All Pending ({pendingCount})
                      </button>
                      <button
                        onClick={() => setTaskDrawerTab("completed")}
                        className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                          taskDrawerTab === "completed"
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                            : "text-neutral-400 hover:text-white hover:bg-white/5"
                        }`}
                      >
                        Completed
                      </button>
                    </div>

                    {/* List */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin">
                      {drawerDisplayedTasks.length === 0 ? (
                        <div className="py-16 text-center">
                          <FiCheckCircle className="mx-auto text-4xl text-neutral-700 mb-3" />
                          <p className="text-neutral-300 font-bold text-sm">No tasks in this view</p>
                          <p className="text-xs text-neutral-500 mt-1">All caught up on your reminders!</p>
                        </div>
                      ) : (
                        drawerDisplayedTasks.map((t: any) => {
                          const isCompleted = t.status === "Completed"
                          const isOverdue = !isCompleted && t.dueDate && new Date(t.dueDate) <= nowTime

                          return (
                            <div 
                              key={t.id} 
                              className={`glass-panel border rounded-xl p-3.5 flex flex-col gap-2.5 transition-all ${
                                isOverdue 
                                  ? "border-rose-500/30 bg-rose-950/10 hover:border-rose-500/50" 
                                  : "border-white/10 hover:border-white/20 bg-neutral-900/80"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border uppercase ${
                                    t.priority === "High" 
                                      ? "bg-rose-500/20 text-rose-300 border-rose-500/30" 
                                      : t.priority === "Low" 
                                        ? "bg-neutral-800 text-neutral-400 border-neutral-700" 
                                        : "bg-amber-500/20 text-amber-300 border-amber-500/30"
                                  }`}>
                                    {t.priority || "Normal"}
                                  </span>
                                  {t.dueDate && (
                                    <span className={`text-[10px] font-medium flex items-center gap-1 ${
                                      isOverdue ? "text-rose-400 font-bold" : "text-neutral-400"
                                    }`}>
                                      <FiCalendar size={10} />
                                      {new Date(t.dueDate).toLocaleDateString()}
                                    </span>
                                  )}
                                </div>

                                {!isCompleted ? (
                                  <button
                                    onClick={async () => {
                                      try {
                                        await fetch("/api/update-task", {
                                          method: "POST",
                                          headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify({ id: t.id, status: "Completed" })
                                        })
                                        toast.success("Task completed!")
                                        fetchTopBarTasks()
                                        window.dispatchEvent(new Event("task-updated"))
                                      } catch (e) {
                                        toast.error("Failed to complete task")
                                      }
                                    }}
                                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] rounded-lg transition-colors flex items-center gap-1 cursor-pointer shadow"
                                  >
                                    <FiCheck size={12} />
                                    <span>Complete</span>
                                  </button>
                                ) : (
                                  <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                                    <FiCheck size={12} /> Completed
                                  </span>
                                )}
                              </div>

                              <div>
                                <h4 className={`text-sm font-bold ${isCompleted ? "line-through text-neutral-500" : "text-white"}`}>
                                  {t.subject || t.title || "Untitled Task"}
                                </h4>
                                {t.description && (
                                  <p className="text-xs text-neutral-400 mt-1 line-clamp-2">{t.description}</p>
                                )}
                              </div>

                              {t.account && (
                                <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px]">
                                  <Link 
                                    href={`/account?id=${t.account.zohoId}`} 
                                    onClick={() => setShowTaskDrawer(false)}
                                    className="text-sky-400 hover:underline font-medium truncate"
                                  >
                                    🏢 {t.account.name}
                                  </Link>
                                </div>
                              )}
                            </div>
                          )
                        })
                      )}
                    </div>

                    {/* Footer */}
                    <div className="p-3.5 border-t border-white/10 bg-neutral-950/90 flex items-center justify-between">
                      <button
                        onClick={() => {
                          setShowTaskDrawer(false)
                          router.push("/tasks")
                        }}
                        className="text-xs font-bold text-sky-400 hover:text-sky-300 underline cursor-pointer flex items-center gap-1"
                      >
                        <span>View Full Tasks Dashboard</span>
                        <span>→</span>
                      </button>
                      <span className="text-[10px] text-neutral-500 font-mono">
                        Updated live
                      </span>
                    </div>
                  </div>
                </div>
              , document.body)}
            </>
          )
        })()}

      </div>

      {/* Modals */}
      {showAddTaskModal && typeof window !== "undefined" && createPortal(
        <TaskModal
          onClose={() => setShowAddTaskModal(false)}
          onSaved={() => {
            setShowAddTaskModal(false)
            fetchTopBarTasks()
            window.dispatchEvent(new Event("task-updated"))
          }}
        />,
        document.body
      )}
    </div>

    {/* Persistent Stats Strip — inside sticky wrapper, no top offset needed */}
    {stripStats && (
      <div className="glass-panel border-x-0 border-t-0 px-4 py-1.5 rounded-none flex items-center gap-0 overflow-x-auto scrollbar-none relative">
        {/* Fade indicator for hidden overflow content */}
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-black/40 to-transparent" />
        <div className="flex items-center gap-4 min-w-max mx-auto">
          <div 
            onClick={() => window.dispatchEvent(new CustomEvent("open-metric-derivation", { detail: { key: "weeklyGoal" } }))}
            className="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity"
            title="Click to view Weekly Goal calculation formula"
          >
            <span className="text-[10px] text-neutral-500 font-medium uppercase tracking-wider">Weekly</span>
            <span className="text-xs font-black text-white">${stripStats.weeklySales.toLocaleString()}</span>
          </div>
          <div className="w-px h-3.5 bg-white/[0.08]"></div>
          <div 
            onClick={() => window.dispatchEvent(new CustomEvent("open-metric-derivation", { detail: { key: "totalRevenue" } }))}
            className="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity"
            title="Click to view Total Revenue calculation formula"
          >
            <span className="text-[10px] text-neutral-500 font-medium uppercase tracking-wider">MTD</span>
            <span className="text-xs font-black text-white">${stripStats.mtdSales.toLocaleString()}</span>
          </div>
          <div className="w-px h-3.5 bg-white/[0.08]"></div>
          <div 
            onClick={() => window.dispatchEvent(new CustomEvent("open-metric-derivation", { detail: { key: "monthlyProfit" } }))}
            className="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity"
            title="Click to view Monthly Profit calculation formula"
          >
            <span className="text-[10px] text-neutral-500 font-medium uppercase tracking-wider">Profit</span>
            <span className="text-xs font-black text-emerald-400">${stripStats.mtdProfit.toLocaleString()}</span>
          </div>
          <div className="w-px h-3.5 bg-white/[0.08]"></div>
          <div 
            onClick={() => window.dispatchEvent(new CustomEvent("open-metric-derivation", { detail: { key: "monthlyProfit" } }))}
            className="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity"
            title="Click to view Commission calculation formula"
          >
            <span className="text-[10px] text-neutral-500 font-medium uppercase tracking-wider">Comm</span>
            <span className="text-xs font-black text-purple-400">${stripStats.mtdCommission.toLocaleString()}</span>
          </div>
          <div className="w-px h-3.5 bg-white/[0.08]"></div>
          <div 
            onClick={() => window.dispatchEvent(new CustomEvent("open-metric-derivation", { detail: { key: "activePipeline" } }))}
            className="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity"
            title="Click to view Pipeline calculation formula"
          >
            <span className="text-[10px] text-neutral-500 font-medium uppercase tracking-wider">Pipeline</span>
            <span className="text-xs font-black text-sky-400">${stripStats.pipeline.toLocaleString()}</span>
          </div>
          {stripStats.overdue > 0 && (
            <>
              <div className="w-px h-3.5 bg-white/[0.08]"></div>
              <div 
                onClick={() => window.dispatchEvent(new CustomEvent("open-metric-derivation", { detail: { key: "activePipeline" } }))}
                className="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity"
                title="Click to view Overdue balance calculation formula"
              >
                <FiAlertCircle size={10} className="text-red-400" />
                <span className="text-[10px] text-red-400/70 font-medium uppercase tracking-wider">Overdue</span>
                <span className="text-xs font-black text-red-400">${stripStats.overdue.toLocaleString()}</span>
              </div>
            </>
          )}
        </div>
      </div>
    )}

    {/* Campaign Progress Pill — inside sticky wrapper */}
    {(campaignState.status === 'running' || campaignState.status === 'done' || campaignState.status === 'cancelled') && (() => {
      const pct = campaignState.total > 0 ? Math.round((campaignState.progress / campaignState.total) * 100) : 0
      const isDone = campaignState.status === 'done'
      const isCancelled = campaignState.status === 'cancelled'
      return (
        <div
          style={{
            animation: 'slideDownIn 0.3s ease-out',
            background: isDone
              ? 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(5,150,105,0.1))'
              : isCancelled
              ? 'linear-gradient(135deg, rgba(239,68,68,0.12), rgba(220,38,38,0.08))'
              : 'linear-gradient(135deg, rgba(249,115,22,0.12), rgba(234,88,12,0.08))',
          }}
          className={`border-x-0 border-t-0 px-4 py-2 rounded-none flex items-center gap-3 overflow-x-auto scrollbar-none border-b ${
            isDone ? 'border-emerald-500/20' : isCancelled ? 'border-red-500/20' : 'border-orange-500/20'
          }`}
        >
          {/* Icon + label */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-sm">
              {isDone ? '✅' : isCancelled ? '🛑' : '📨'}
            </span>
            <span className={`text-xs font-bold ${
              isDone ? 'text-emerald-400' : isCancelled ? 'text-red-400' : 'text-orange-300'
            }`}>
              {isDone ? 'Campaign Complete' : isCancelled ? 'Campaign Cancelled' : 'Campaign Sending'}
            </span>
            {campaignState.name && (
              <span className="text-xs text-neutral-400 font-medium hidden sm:inline truncate max-w-[140px]">
                -- {campaignState.name}
              </span>
            )}
          </div>

          {/* Progress bar */}
          <div className="flex-1 min-w-[80px] max-w-[220px] h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                isDone
                  ? 'bg-emerald-500'
                  : isCancelled
                  ? 'bg-red-500'
                  : 'bg-orange-500 campaign-shimmer'
              }`}
              style={{ width: `${isDone ? 100 : pct}%` }}
            />
          </div>

          {/* Count */}
          <span className="text-xs font-mono text-neutral-300 shrink-0">
            {campaignState.progress.toLocaleString()} / {campaignState.total.toLocaleString()}
            {campaignState.sentCount > 0 && !isDone && (
              <span className="text-emerald-400 ml-1">({campaignState.sentCount} sent)</span>
            )}
          </span>

          {/* Open button */}
          <button
            onClick={() => {
              if (campaignState.blastId) {
                router.push(`/messages?campaignBlastId=${campaignState.blastId}`)
              } else {
                router.push("/messages")
              }
            }}
            className="shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20 text-white transition-colors hidden sm:flex items-center gap-1"
            title="Open campaign"
          >
            Open  up 
          </button>

          {/* Cancel button -- only while running */}
          {campaignState.status === 'running' && (
            <button
              onClick={cancelCampaign}
              className="shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-md bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors"
              title="Cancel campaign"
            >
              Stop
            </button>
          )}
        </div>
      )
    })()}
    </div>{/* end sticky wrapper */}
    {showClockInPrompt && currentUser?.id && (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[600] animate-[slideUp_0.3s_ease-out]">
        <div className="flex items-center gap-3 bg-gradient-to-r from-blue-900/95 to-indigo-900/95 backdrop-blur-xl border border-blue-500/30 rounded-2xl px-5 py-3 shadow-[0_8px_32px_rgba(59,130,246,0.3)] text-white">
          <div className="w-9 h-9 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
            <FiClock size={18} className="text-blue-400" />
          </div>
          <div className="text-sm">
            <div className="font-bold">You&apos;re not clocked in</div>
            <div className="text-blue-300/70 text-xs">Clock in to track your hours?</div>
          </div>
          <button
            onClick={handlePromptClockIn}
            className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold rounded-lg transition-colors shadow-lg shadow-emerald-500/20 whitespace-nowrap"
          >
            Clock In
          </button>
          <button
            onClick={dismissClockInPrompt}
            className="text-blue-400/50 hover:text-white text-lg leading-none transition-colors px-1"
            title="Dismiss"
          >
            ×
          </button>
        </div>
      </div>
    )}
    </>
  )
}

