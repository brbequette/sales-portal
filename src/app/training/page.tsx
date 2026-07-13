"use client"

import { useState, useCallback } from "react"
import { FiBookOpen, FiSearch, FiChevronRight, FiDownload } from "react-icons/fi"
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
    const orderedMatch = line.match(/^(\d+)\.\s(.*)$/)
    if (orderedMatch) {
      const parts = orderedMatch[2].split(/(\*\*.*?\*\*)/)
      return (
        <div key={i} className="flex gap-3 mb-1.5 ml-1">
          <span className="text-[var(--primary)] font-bold shrink-0 tabular-nums">{orderedMatch[1]}.</span>
          <span className="text-neutral-300 leading-relaxed">
            {parts.map((part, j) =>
              part.startsWith("**") && part.endsWith("**")
                ? <strong key={j} className="text-white font-semibold">{part.replace(/\*\*/g, "")}</strong>
                : part
            )}
          </span>
        </div>
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

function markdownToHtml(content: string): string {
  return content.split('\n').map(line => {
    if (line.startsWith('### ')) return `<h3 style="font-size:16px;font-weight:bold;margin:18px 0 8px 0;color:#111;">${line.replace('### ', '')}</h3>`
    if (line.startsWith('- ')) {
      const text = line.replace('- ', '').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      return `<li style="margin-left:20px;margin-bottom:4px;color:#333;">${text}</li>`
    }
    const orderedMatch = line.match(/^(\d+)\.\s(.*)$/)
    if (orderedMatch) {
      const text = orderedMatch[2].replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      return `<div style="margin-bottom:4px;color:#333;"><strong style="color:#0a6;">${orderedMatch[1]}.</strong> ${text}</div>`
    }
    if (line.trim() === '') return '<div style="height:8px;"></div>'
    const text = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    return `<p style="color:#333;line-height:1.6;margin:2px 0;">${text}</p>`
  }).join('\n')
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

  const generatePdf = useCallback((modules: TrainingModule[], title: string) => {
    const content = modules.map((mod, i) => `
      ${i > 0 ? '<div style="page-break-before:always;"></div>' : ''}
      <div style="margin-bottom:32px;">
        <div style="font-size:11px;font-weight:bold;color:#0a6;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">${mod.category}</div>
        <h2 style="font-size:22px;font-weight:900;color:#111;margin:0 0 16px 0;padding-bottom:12px;border-bottom:2px solid #e5e5e5;">${mod.title}</h2>
        ${markdownToHtml(mod.content)}
      </div>
    `).join('')

    const html = `<!DOCTYPE html>
<html>
<head>
  <title>${title} — Titan Diamond Training</title>
  <style>
    @page { margin: 0.75in; size: letter; }
    body { font-family: 'Segoe UI', Arial, Helvetica, sans-serif; font-size: 13px; color: #333; line-height: 1.6; margin: 0; padding: 0; }
    h3 { page-break-after: avoid; }
    li { page-break-inside: avoid; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div style="text-align:center;margin-bottom:32px;padding-bottom:20px;border-bottom:3px solid #0a6;">
    <h1 style="font-size:28px;font-weight:900;color:#111;margin:0;">Titan Diamond — Sales Hub</h1>
    <div style="font-size:14px;color:#666;margin-top:4px;">${title}</div>
    <div style="font-size:11px;color:#999;margin-top:4px;">Generated ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
  </div>
  ${content}
  <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e5e5;text-align:center;font-size:11px;color:#999;">
    © ${new Date().getFullYear()} Titan Diamond — Confidential Training Material
  </div>
</body>
</html>`

    const printWindow = window.open('', '_blank')
    if (!printWindow) { alert('Please allow popups to download the PDF.'); return }
    printWindow.document.write(html)
    printWindow.document.close()
    printWindow.onload = () => {
      setTimeout(() => { printWindow.print() }, 300)
    }
  }, [])

  return (
    <div className="p-4 lg:p-8 flex flex-col h-[calc(100dvh-7rem)] lg:h-screen max-w-7xl mx-auto">
      <div className="mb-6 shrink-0 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2">
            <FiBookOpen className="text-[var(--primary)]" /> Training Hub
          </h1>
          <p className="text-neutral-400 mt-1">Learn how to use every part of the Titan Hub — sales, communication, collections, payroll, and admin.</p>
        </div>
        <button
          onClick={() => generatePdf(trainingModules, 'Complete Training Manual')}
          className="px-4 py-2 bg-[var(--primary)] hover:bg-emerald-500 text-white text-xs font-bold rounded-lg flex items-center gap-2 shrink-0 transition-colors shadow-lg"
        >
          <FiDownload size={14} />
          Download PDF
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 min-h-0 flex-1">
        
        {/* Sidebar Menu */}
        <div className="lg:w-80 flex flex-col gap-4 shrink-0 bg-[var(--surface)] border border-white/10 rounded-2xl p-4 overflow-y-auto hidden-scrollbar shadow-xl">
          <div className="relative shrink-0">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input 
              type="text" 
              placeholder="Search training..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-[var(--surface-2)] border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--primary)] transition-colors"
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
                            ? "bg-[var(--primary)]/15 text-[var(--primary)] font-semibold border border-[var(--primary)]/25" 
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
        <div className="flex-1 bg-[var(--surface)] border border-white/10 rounded-2xl shadow-xl overflow-hidden flex flex-col relative">
          {selectedModule ? (
            <div className="absolute inset-0 overflow-y-auto p-6 lg:p-10 hidden-scrollbar">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-semibold text-[var(--primary)]">{selectedModule.category}</div>
                <button
                  onClick={() => generatePdf([selectedModule], selectedModule.title)}
                  className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white text-[11px] font-bold rounded-lg flex items-center gap-1.5 transition-colors"
                >
                  <FiDownload size={12} />
                  Print This Guide
                </button>
              </div>
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
