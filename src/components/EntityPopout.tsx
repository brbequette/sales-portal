"use client"

import React, { useEffect } from "react"
import { createPortal } from "react-dom"
import { FiChevronLeft, FiChevronRight, FiX, FiFileText, FiUser, FiBox, FiTruck, FiBookOpen } from "react-icons/fi"
import { DocumentPopoutContent } from "./DocumentPopoutContent"

export type EntityType = 'invoice' | 'estimate' | 'salesorder' | 'account' | 'package' | 'purchaseorder' | 'vendor' | 'product' | 'quote'

export interface EntityPopoutProps {
  entityType: EntityType
  entityId: string
  entities?: Array<{ id: string, type: string, [key: string]: any }>
  currentIndex?: number
  onClose: () => void
  onNavigate?: (index: number) => void
  permissions?: { isAdmin: boolean, canViewFinancials: boolean, canEdit: boolean }
}

export function EntityPopout({
  entityType,
  entityId,
  entities,
  currentIndex,
  onClose,
  onNavigate,
  permissions
}: EntityPopoutProps) {
  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      if (entities && entities.length > 1 && onNavigate && currentIndex !== undefined) {
        if (e.key === "ArrowLeft" && currentIndex > 0) onNavigate(currentIndex - 1)
        if (e.key === "ArrowRight" && currentIndex < entities.length - 1) onNavigate(currentIndex + 1)
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [entities, currentIndex, onClose, onNavigate])

  const hasList = entities && entities.length > 1 && onNavigate !== undefined && currentIndex !== undefined

  // Derive title/icon
  let Icon = FiFileText
  let title = "Document Details"
  if (entityType === 'account') { Icon = FiUser; title = "Account Details" }
  else if (entityType === 'package') { Icon = FiBox; title = "Package Details" }
  else if (entityType === 'purchaseorder') { Icon = FiTruck; title = "Purchase Order Details" }
  else if (entityType === 'vendor') { Icon = FiUser; title = "Vendor Details" }
  else if (entityType === 'product') { Icon = FiBox; title = "Product Details" }
  else if (entityType === 'invoice') { Icon = FiFileText; title = "Invoice Details" }
  else if (entityType === 'estimate' || entityType === 'quote') { Icon = FiFileText; title = "Estimate Details" }
  else if (entityType === 'salesorder') { Icon = FiFileText; title = "Sales Order Details" }

  return createPortal(
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-3 sm:p-6 animate-fade-in overflow-hidden">
      <div className="fixed inset-0 bg-black/85 backdrop-blur-sm" onClick={onClose} />
      <div className="relative glass-panel border border-white/10 w-full max-w-6xl max-h-[90vh] h-full my-auto rounded-2xl overflow-hidden flex flex-col shadow-2xl z-[500] animate-scale-in">
        
        {/* Header Shell */}
        <div className="glass-panel px-3 sm:px-6 py-3 sm:py-4 border-b border-white/10 flex flex-wrap justify-between items-center gap-2 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <h2 className="text-sm font-bold flex items-center gap-2 text-white">
              <Icon className="shrink-0 text-orange-500" /> <span className="truncate">{title}</span>
            </h2>
            
            {hasList && (
              <div className="flex items-center gap-1 bg-black/20 border border-white/10 rounded-lg p-0.5 shrink-0 ml-2">
                <button
                  onClick={() => onNavigate!(currentIndex! - 1)}
                  disabled={currentIndex === 0}
                  className="p-1.5 rounded text-neutral-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <FiChevronLeft size={14} />
                </button>
                <span className="text-[10px] font-bold text-neutral-400 px-1 tabular-nums">
                  {currentIndex! + 1} of {entities!.length}
                </span>
                <button
                  onClick={() => onNavigate!(currentIndex! + 1)}
                  disabled={currentIndex === entities!.length - 1}
                  className="p-1.5 rounded text-neutral-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <FiChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-2 justify-end shrink-0" id="entity-popout-actions">
            {/* The content component can portal actions here if needed, or we just keep generic close here */}
            {['invoice', 'estimate', 'quote', 'salesorder'].includes(entityType) && (
               <button 
                 onClick={() => { /* dispatch open pdf viewer event or handle here */ }}
                 className="bg-neutral-800 hover:bg-neutral-700 text-white font-bold px-2 sm:px-3 py-1.5 rounded-lg text-[10px] sm:text-xs transition-colors border border-neutral-700 flex items-center gap-1 sm:gap-1.5 cursor-pointer whitespace-nowrap"
               >
                 <FiBookOpen size={12} /> <span className="hidden sm:inline">Flipbook</span>
               </button>
            )}
            <button 
              onClick={onClose} 
              className="text-neutral-400 hover:text-white p-1 bg-neutral-800 hover:bg-neutral-755 transition-colors rounded-full w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center font-bold text-base sm:text-lg cursor-pointer shrink-0"
            >
              &times;
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden flex flex-col relative bg-[#0a0b0d]">
          {['invoice', 'estimate', 'quote', 'salesorder'].includes(entityType) ? (
            <DocumentPopoutContent 
              entityId={entityId} 
              entityType={entityType as any} 
              onClose={onClose} 
              entities={entities} 
              currentIndex={currentIndex} 
              onNavigate={onNavigate} 
            />
          ) : entityType === 'account' ? (
            <div className="p-6 text-white">Account Content (Placeholder)</div>
          ) : entityType === 'package' ? (
            <div className="p-6 text-white">Package Content (Placeholder)</div>
          ) : (
             <div className="p-6 text-white">Content for {entityType}</div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
