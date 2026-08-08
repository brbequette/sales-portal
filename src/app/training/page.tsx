"use client"

import { useState, useCallback } from "react"
import { FiBookOpen, FiSearch, FiChevronRight, FiDownload } from "react-icons/fi"
import { trainingModules, trainingCategories, TrainingModule } from "@/lib/trainingData"
import { toast } from 'react-hot-toast'

function MarkdownContent({ content }: { content: string }) {
  const renderLine = (line: string, i: number) => {
    if (line.startsWith("### ")) {
      return <h3 key={i} className="text-lg font-bold text-white mt-6 mb-2">{line.replace("### ", "")}</h3>
    }
    if (line.startsWith("- ")) {
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
  <title>${title} -- Titan Diamond Training</title>
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
    <h1 style="font-size:28px;font-weight:900;color:#111;margin:0;">Titan Diamond -- Sales Hub</h1>
    <div style="font-size:14px;color:#666;margin-top:4px;">${title}</div>
    <div style="font-size:11px;color:#999;margin-top:4px;">Generated ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
  </div>
  ${content}
  <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e5e5;text-align:center;font-size:11px;color:#999;">
    (C) ${new Date().getFullYear()} Titan Diamond -- Confidential Training Material
  </div>
</body>
</html>`

    const printWindow = window.open('', '_blank')
    if (!printWindow) { toast.error('Please allow popups to download the PDF.'); return }
    printWindow.document.write(html)
    printWindow.document.close()
    printWindow.onload = () => {
      setTimeout(() => { printWindow.print() }, 300)
    }
  }, [])

  return (
    <div className="page-content">

      {/* ─── Header ────────────────────────────────────────────────── */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-teal-500/10 border border-teal-500/20 rounded-xl flex items-center justify-center">
            <FiBookOpen className="text-teal-400" size={17} />
          </div>
          <div>
            <h1 className="page-title">Training Hub</h1>
            <p className="page-subtitle">Sales, communication, collections, payroll & admin guides</p>
          </div>
        </div>
        <button
          onClick={() => generatePdf(trainingModules, 'Complete Training Manual')}
          className="td-btn td-btn-primary td-btn-sm shrink-0"
        >
          <FiDownload size={13} />
          Download PDF
        </button>
      </div>

      {/* ─── Body ──────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-4 p-4 lg:p-6 overflow-hidden animate-fade-in">

        {/* Sidebar */}
        <div className="lg:w-72 xl:w-80 flex flex-col gap-3 shrink-0 glass-panel rounded-2xl p-4 overflow-y-auto scrollbar-none">
          <div className="relative shrink-0">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={14} />
            <input
              type="text"
              placeholder="Search training..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="td-input pl-9"
            />
          </div>

          <div className="flex-1 overflow-y-auto space-y-5 pt-1 scrollbar-none">
            {modulesByCategory.length === 0 ? (
              <div className="text-sm text-neutral-500 text-center py-8">No matching guides found.</div>
            ) : (
              modulesByCategory.map(cat => (
                <div key={cat.category}>
                  <h4 className="section-header">{cat.category}</h4>
                  <div className="space-y-0.5">
                    {cat.modules.map(mod => (
                      <button
                        key={mod.id}
                        onClick={() => setSelectedModule(mod)}
                        className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-all flex items-center justify-between gap-2 ${
                          selectedModule?.id === mod.id
                            ? "bg-orange-500/10 text-orange-300 font-semibold border border-orange-500/20"
                            : "hover:bg-white/5 text-neutral-400 hover:text-white border border-transparent"
                        }`}
                      >
                        <span className="truncate">{mod.title}</span>
                        {selectedModule?.id === mod.id && <FiChevronRight size={13} className="shrink-0" />}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Content Pane */}
        <div className="flex-1 glass-panel rounded-2xl overflow-hidden flex flex-col relative">
          {selectedModule ? (
            <div className="absolute inset-0 overflow-y-auto p-6 lg:p-10 scrollbar-none">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-bold text-orange-400 uppercase tracking-wider">{selectedModule.category}</div>
                <button
                  onClick={() => generatePdf([selectedModule], selectedModule.title)}
                  className="td-btn td-btn-ghost td-btn-sm"
                >
                  <FiDownload size={12} />
                  Print Guide
                </button>
              </div>
              <h2 className="text-2xl lg:text-3xl font-black text-white mb-6 pb-5 border-b border-white/10">
                {selectedModule.title}
              </h2>
              <MarkdownContent content={selectedModule.content} />
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-neutral-500 p-8 text-center">
              <div className="w-16 h-16 bg-teal-500/10 border border-teal-500/15 rounded-2xl flex items-center justify-center mb-4">
                <FiBookOpen size={28} className="text-teal-500/50" />
              </div>
              <h3 className="text-base font-bold text-neutral-400 mb-1">Select a training module</h3>
              <p className="text-sm text-neutral-600 max-w-xs">Choose a guide from the sidebar to learn how to use the Sales Portal.</p>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
