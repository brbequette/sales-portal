"use client"

import { useState } from "react"
import { FiBookOpen, FiSearch, FiChevronRight } from "react-icons/fi"
import { trainingModules, trainingCategories, TrainingModule } from "@/lib/trainingData"

function MarkdownContent({ content }: { content: string }) {
  // A simple parser for basic markdown since we don't have react-markdown installed
  const renderLine = (line: string, i: number) => {
    if (line.startsWith("### ")) {
      return <h3 key={i} className="text-lg font-bold text-white mt-6 mb-2">{line.replace("### ", "")}</h3>
    }
    if (line.startsWith("- ")) {
      // Bold text inside list item
      const parts = line.replace("- ", "").split(/(\*\*.*?\*\*)/)
      return (
        <li key={i} className="ml-4 list-disc text-neutral-300 mb-1">
          {parts.map((part, j) => 
            part.startsWith("**") && part.endsWith("**") 
              ? <strong key={j} className="text-white font-semibold">{part.replace(/\*\*/g, "")}</strong>
              : part
          )}
        </li>
      )
    }
    if (line.trim() === "") {
      return <div key={i} className="h-2"></div>
    }
    
    // Bold text inside regular paragraph
    const parts = line.split(/(\*\*.*?\*\*)/)
    return (
      <p key={i} className="text-neutral-300 leading-relaxed">
        {parts.map((part, j) => 
          part.startsWith("**") && part.endsWith("**") 
            ? <strong key={j} className="text-white font-semibold">{part.replace(/\*\*/g, "")}</strong>
            : part
        )}
      </p>
    )
  }

  return (
    <div className="space-y-1">
      {content.split("\n").map(renderLine)}
    </div>
  )
}

export default function TrainingPage() {
  const [search, setSearch] = useState("")
  const [selectedModule, setSelectedModule] = useState<TrainingModule | null>(null)

  const filteredModules = trainingModules.filter(m => 
    m.title.toLowerCase().includes(search.toLowerCase()) || 
    m.content.toLowerCase().includes(search.toLowerCase()) ||
    m.category.toLowerCase().includes(search.toLowerCase())
  )

  const modulesByCategory = trainingCategories.map(cat => ({
    category: cat,
    modules: filteredModules.filter(m => m.category === cat)
  })).filter(c => c.modules.length > 0)

  return (
    <div className="p-4 lg:p-8 flex flex-col h-[calc(100vh-64px)] lg:h-screen max-w-7xl mx-auto">
      <div className="mb-6 shrink-0">
        <h1 className="text-2xl font-black text-white flex items-center gap-2">
          <FiBookOpen className="text-blue-400" /> Training Hub
        </h1>
        <p className="text-neutral-400 mt-1">Learn how to use the Sales Portal and its features.</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 min-h-0 flex-1">
        
        {/* Sidebar Menu */}
        <div className="lg:w-80 flex flex-col gap-4 shrink-0 bg-[#151618] border border-white/10 rounded-2xl p-4 overflow-y-auto hidden-scrollbar shadow-xl">
          <div className="relative shrink-0">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input 
              type="text" 
              placeholder="Search training..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-[#111214] border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          <div className="flex-1 overflow-y-auto space-y-6 pt-2">
            {modulesByCategory.length === 0 ? (
              <div className="text-sm text-neutral-500 text-center py-8">No matching guides found.</div>
            ) : (
              modulesByCategory.map(cat => (
                <div key={cat.category}>
                  <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">{cat.category}</h4>
                  <div className="space-y-1">
                    {cat.modules.map(mod => (
                      <button
                        key={mod.id}
                        onClick={() => setSelectedModule(mod)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between ${
                          selectedModule?.id === mod.id 
                            ? "bg-blue-500/20 text-blue-400 font-semibold" 
                            : "hover:bg-white/5 text-neutral-300 hover:text-white"
                        }`}
                      >
                        <span className="truncate">{mod.title}</span>
                        {selectedModule?.id === mod.id && <FiChevronRight />}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 bg-[#151618] border border-white/10 rounded-2xl shadow-xl overflow-hidden flex flex-col relative">
          {selectedModule ? (
            <div className="absolute inset-0 overflow-y-auto p-6 lg:p-10 hidden-scrollbar">
              <div className="mb-2 text-sm font-semibold text-blue-400">{selectedModule.category}</div>
              <h2 className="text-3xl font-black text-white mb-6 pb-6 border-b border-white/10">{selectedModule.title}</h2>
              <MarkdownContent content={selectedModule.content} />
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-neutral-500 p-8 text-center">
              <FiBookOpen size={48} className="opacity-20 mb-4" />
              <h3 className="text-lg font-bold text-neutral-400 mb-1">Select a training module</h3>
              <p className="text-sm max-w-sm">Choose a guide from the sidebar to learn more about how to use the Sales Portal.</p>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
