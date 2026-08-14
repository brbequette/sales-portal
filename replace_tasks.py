import sys

with open("src/app/tasks/page.tsx", "r", encoding="utf-8") as f:
    lines = f.readlines()

# 1. Replace StatusChip to TaskCard (Lines 116 to 305)
chunk1 = """// ─── STATUS LABEL ──────────────────────────────────────────────────────────────
function StatusChip({ status }: { status: string }) {
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded border shrink-0 ${STATUS_COLORS[status] || STATUS_COLORS["Not Started"]}`}>
      {status === "Waiting on someone else" ? "Waiting" : status}
    </span>
  )
}

// ─── PRIORITY ICON ─────────────────────────────────────────────────────────────
function PriorityIcon({ priority }: { priority: string }) {
  if (priority === "High")   return <FiArrowUp size={12} className="text-red-400 shrink-0" />
  if (priority === "Low")    return <FiArrowDown size={12} className="text-blue-400 shrink-0" />
  return <FiMinus size={12} className="text-neutral-600 shrink-0" />
}

// ─── TASK CARD (mobile-first) ──────────────────────────────────────────────────
function TaskCard({ task, onTap, onComplete, onStatusChange }: {
  task: Task
  onTap: () => void
  onComplete: () => void
  onStatusChange: (s: string) => void
}) {
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const cat = classifyTask(task)
  const cfg = CAT[cat]
  const overdue = isOverdue(task)
  const completed = task.status === "Completed"

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false)
    }
    if (showMenu) document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [showMenu])

  return (
    <div
      className={`group relative rounded-xl border transition-all hover:border-white/20 active:scale-[0.99] ${
        completed ? "opacity-55 border-white/5 bg-white/2" :
        overdue   ? "border-red-500/20 bg-[#151111] hover:border-red-500/30" :
                    `border-white/10 bg-[#131517]`
      }`}
    >
      {/* Category accent bar */}
      <div className={`absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full ${cfg.dot} opacity-70`} />

      <div className="flex flex-col p-3.5 pl-4">
        {/* Top row: Type + Priority + Title */}
        <div className="flex items-start gap-2 mb-1.5 cursor-pointer" onClick={onTap} style={{ WebkitTapHighlightColor: "transparent" }}>
          <div className={`mt-0.5 ${cfg.text}`}>
            {TYPE_ICON[task.type] || TYPE_ICON.Task}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className={`text-[15px] font-semibold leading-tight truncate ${completed ? "line-through text-neutral-500" : "text-neutral-200 group-hover:text-white transition-colors"}`}>
              {task.title}
            </h3>
            
            {/* Meta row: account, deal, due date */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px]">
              {task.dueDate && (
                <span className={`flex items-center gap-1 font-medium ${overdue && !completed ? "text-red-400" : "text-neutral-500"}`}>
                  <FiClock size={10} />
                  {fmtDate(task.dueDate)}{fmtTime(task.dueDate) ? ` • ${fmtTime(task.dueDate)}` : ""}
                  {overdue && !completed && <span className="font-bold ml-0.5">OVERDUE</span>}
                </span>
              )}
              {task.accountName && (
                <span className="text-neutral-400 flex items-center gap-1 truncate max-w-[120px]">
                  <FiUser size={10} className="opacity-70" />
                  {task.accountName}
                </span>
              )}
              {task.dealName && (
                <span className="text-neutral-400 flex items-center gap-1 truncate max-w-[120px]">
                  <FiShare2 size={10} className="opacity-70" />
                  {task.dealName}
                </span>
              )}
              {task.priority !== "Normal" && (
                <span className="flex items-center gap-0.5" title={`${task.priority} Priority`}>
                  <PriorityIcon priority={task.priority} />
                </span>
              )}
            </div>
          </div>

          <div className="shrink-0 flex flex-col items-end gap-2 ml-2">
            <StatusChip status={task.status} />
          </div>
        </div>

        {/* Action strip integrated into card bottom via flex-row */}
        <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-2.5">
          {/* Quick complete */}
          <button
            onClick={e => { e.stopPropagation(); onComplete() }}
            className={`text-xs font-medium flex items-center gap-1.5 px-2 py-1 -ml-2 rounded-lg transition-all ${
              completed ? "text-neutral-500" : "text-neutral-400 hover:text-emerald-400 hover:bg-emerald-400/10"
            }`}
          >
            <FiCheck size={12} />
            {completed ? "Completed" : "Complete"}
          </button>
          
          {/* Document links simple icons */}
          <div className="flex items-center gap-2">
             {(task.invoiceId || task.salesOrderId || task.quoteId || task.estimateId) && (
               <div className="flex items-center gap-1.5 text-neutral-500" title="Linked documents">
                 <FiFileText size={12} />
               </div>
             )}
             
             {/* Status menu button */}
             <div className="relative" ref={menuRef}>
               <button
                 onClick={e => { e.stopPropagation(); setShowMenu(!showMenu) }}
                 className="p-1 text-neutral-500 hover:text-white rounded-md transition-colors"
               >
                 <FiMoreVertical size={14} />
               </button>
               {showMenu && (
                 <div className="absolute bottom-full right-0 mb-1 w-48 bg-[#1c1e22] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-30">
                    <div className="px-3 pt-2 pb-1 border-b border-white/5">
                      <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider">Set Status</p>
                    </div>
                    {["Not Started","In Progress","Waiting on someone else","Deferred","Completed"].map(s => (
                      <button key={s} onClick={() => { onStatusChange(s); setShowMenu(false) }}
                        className={`w-full text-left text-xs px-3 py-2.5 transition-colors flex items-center gap-2 ${task.status === s ? "text-white bg-white/5" : "text-neutral-400 hover:bg-white/5 hover:text-white"}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${STATUS_COLORS[s]?.includes("emerald") ? "bg-emerald-400" : STATUS_COLORS[s]?.includes("sky") ? "bg-sky-400" : STATUS_COLORS[s]?.includes("yellow") ? "bg-yellow-400" : "bg-neutral-500"}`} />
                        {s === "Waiting on someone else" ? "Waiting..." : s}
                      </button>
                    ))}
                 </div>
               )}
             </div>
          </div>
        </div>
      </div>
    </div>
  )
}
"""

# 2. Replace Header and Toolbar (Lines 1079 to 1211)
chunk2 = """  return (
    <div className="page-content flex flex-col h-[100dvh] bg-[#0a0b0d]">

      {/* ─── Header ─── */}
      <div className="shrink-0 px-4 pt-safe-top pb-3 border-b border-white/10 bg-[#0a0b0d] z-20">
        <UpdateBanner show={updateAvailable} onUpdate={() => { setUpdateAvailable(false); loadTasks(true) }} accentColor="orange" label="Tasks updated" />
        
        {/* Row 1: Title + Actions */}
        <div className="flex items-center justify-between w-full mt-2">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              Task Hub
              <span className="text-xs font-normal text-neutral-400 border border-white/10 bg-white/5 px-2 py-0.5 rounded-full">
                {taskPeriod !== 'all' ? `${filteredTasks.length} tasks` : `${stats.open} open`}
              </span>
            </h1>
          </div>

          {/* Top Actions */}
          <div className="flex items-center gap-1.5">
            <button onClick={() => setShowSearch(s => !s)}
              className={`p-2 rounded-lg border transition-all ${showSearch ? "bg-orange-500 border-orange-500/50 text-white" : "bg-transparent border-transparent hover:bg-white/5 text-neutral-400"}`}
            >
              <FiSearch size={16} />
            </button>
            <button onClick={() => setShowFilter(true)}
              className={`relative p-2 rounded-lg border transition-all ${activeFilterCount > 0 ? "bg-orange-500/20 border-orange-500/30 text-orange-400" : "bg-transparent border-transparent hover:bg-white/5 text-neutral-400"}`}
            >
              <FiFilter size={16} />
              {activeFilterCount > 0 && (
                <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-orange-500 rounded-full" />
              )}
            </button>
            <button onClick={() => loadTasks(true)} disabled={refreshing}
              className="p-2 rounded-lg border border-transparent hover:bg-white/5 text-neutral-400 transition-all disabled:opacity-40 hidden sm:block"
            >
              <FiRefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
            </button>
            <Link href="/tasks/new"
              className="flex items-center gap-1 bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold px-3 py-1.5 rounded-lg transition-all ml-1"
            >
              <FiPlus size={16} />
              <span className="hidden sm:inline">New Task</span>
            </Link>
          </div>
        </div>

        {/* Row 2: Toolbar with View Toggle, Categories, and filters */}
        <div className="flex flex-wrap items-center gap-3 w-full mt-3">
           <div className="flex bg-white/5 p-0.5 rounded-lg border border-white/10 shrink-0">
             <button onClick={() => setMainView("list")}
               className={`flex items-center justify-center w-8 h-7 rounded-md transition-colors ${mainView==="list" ? "bg-[#1c1e22] text-white shadow-sm" : "text-neutral-500 hover:text-white"}`}
             ><FiList size={14}/></button>
             <button onClick={() => setMainView("calendar")}
               className={`flex items-center justify-center w-8 h-7 rounded-md transition-colors ${mainView==="calendar" ? "bg-[#1c1e22] text-white shadow-sm" : "text-neutral-500 hover:text-white"}`}
             ><FiCalendar size={14}/></button>
           </div>
           
           {/* Categories integrated into toolbar */}
           {mainView === "list" && (
             <div className="flex items-center gap-1 overflow-x-auto hide-scroll shrink-0 border-l border-white/10 pl-3">
                {(Object.keys(CAT) as Category[]).map(c => {
                  const cnt = c === "all" ? filteredTasks.length :
                    filteredTasks.filter(t => classifyTask(t) === c).length
                  return (
                    <button key={c} onClick={() => setCategory(c)}
                      className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                        category === c ? `${CAT[c].text} bg-white/5` : "text-neutral-500 hover:text-neutral-300"
                      }`}
                    >
                      {CAT[c].label}
                      <span className="opacity-50">({cnt})</span>
                    </button>
                  )
                })}
             </div>
           )}

           <div className="ml-auto flex items-center gap-3 shrink-0">
             <PeriodSelector
               value={taskPeriod}
               onChange={setTaskPeriod}
               options={["today", "this_week", "this_month", "all"]}
               accentColor="orange"
               customStart={taskCustomStart}
               customEnd={taskCustomEnd}
               onCustomStartChange={setTaskCustomStart}
               onCustomEndChange={setTaskCustomEnd}
               compact
             />
             
             <button
               onClick={() => setShowCompleted(v => !v)}
               className={`flex items-center gap-1.5 text-xs font-semibold transition-all ${
                 showCompleted ? "text-emerald-400" : "text-neutral-500 hover:text-neutral-300"
               }`}
             >
               <FiCheck size={14} />
               <span className="hidden sm:inline">Completed</span>
             </button>
           </div>
        </div>

        {/* Search bar */}
        {showSearch && (
          <div className="w-full mt-3">
            <input
              autoFocus
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search tasks, accounts..."
              className="w-full bg-[#131517] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500/50"
            />
          </div>
        )}
      </div>
"""

# 3. Replace Content (Lines 1212 to 1290)
chunk3 = """      {/* ─── Content ─── */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col bg-[#0a0b0d]">
        {mainView === "calendar" ? (
          <MiniCalendar tasks={tasks} onSelectTask={setSelectedTask} />
        ) : (
          <div className="h-full overflow-y-auto px-4 py-4 hide-scroll">
            {tasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center max-w-sm mx-auto pb-10">
                <FiCheckCircle size={40} className="text-neutral-700 mb-3" />
                <p className="text-base font-bold text-neutral-300">All caught up!</p>
                <p className="text-sm text-neutral-500 mt-1 mb-5">You have no tasks pending.</p>
                <Link href="/tasks/new"
                  className="flex items-center gap-2 bg-white/5 hover:bg-white/10 text-white font-medium px-4 py-2 rounded-lg transition-all text-sm border border-white/10"
                >
                  <FiPlus size={14} /> Create a Task
                </Link>
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center max-w-sm mx-auto pb-10">
                <FiFilter size={40} className="text-neutral-700 mb-3" />
                <p className="text-base font-bold text-neutral-300">No matches</p>
                <p className="text-sm text-neutral-500 mt-1">Try adjusting your filters or search.</p>
              </div>
            ) : category === "all" ? (
              /* Grouped view */
              <div className="space-y-6">
                {(["communication","sales","process"] as const).map(cat => {
                  const catTasks = groups[cat]
                  if (catTasks.length === 0) return null
                  const cfg = CAT[cat]
                  const catLabels: Record<string, string> = {
                    communication: "Communication",
                    sales: "Sales & Deals",
                    process: "Office & Process"
                  }
                  return (
                    <div key={cat} className="mb-6 last:mb-0">
                      <div className="flex items-center gap-2 mb-3 px-1">
                        <span className={`w-1 h-3.5 rounded-full shrink-0 ${cfg.dot}`} />
                        <span className="text-xs font-bold text-neutral-300 uppercase tracking-wider">{catLabels[cat]}</span>
                        <span className="ml-1 text-[10px] text-neutral-500 font-medium">({catTasks.length})</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
                        {catTasks.map(task => (
                          <TaskCard
                            key={task.id}
                            task={task}
                            onTap={() => setSelectedTask(task)}
                            onComplete={() => handleComplete(task.zohoId)}
                            onStatusChange={s => handleUpdate(task.zohoId, { status: s as TaskStatus })}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              /* Single category */
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
                {filteredTasks.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onTap={() => setSelectedTask(task)}
                    onComplete={() => handleComplete(task.zohoId)}
                    onStatusChange={s => handleUpdate(task.zohoId, { status: s as TaskStatus })}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>"""

new_lines = []
new_lines.extend(lines[0:115])
new_lines.append(chunk1 + "\n")
new_lines.extend(lines[305:1078])
new_lines.append(chunk2 + "\n")
new_lines.append(chunk3 + "\n")
new_lines.extend(lines[1290:])

with open("src/app/tasks/page.tsx", "w", encoding="utf-8") as f:
    f.writelines(new_lines)
