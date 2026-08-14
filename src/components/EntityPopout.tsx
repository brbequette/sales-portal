"use client"

import React, { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { FiChevronLeft, FiChevronRight, FiFileText, FiUser, FiBox, FiTruck, FiBookOpen } from "react-icons/fi"
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
  const [isVisible, setIsVisible] = useState(false)

  // Animate in on mount
  useEffect(() => {
    requestAnimationFrame(() => setIsVisible(true))
  }, [])

  // Close with animation
  const handleClose = () => {
    setIsVisible(false)
    setTimeout(onClose, 250)
  }

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose()
      if (entities && entities.length > 1 && onNavigate && currentIndex !== undefined) {
        if (e.key === "ArrowLeft" && currentIndex > 0) onNavigate(currentIndex - 1)
        if (e.key === "ArrowRight" && currentIndex < entities.length - 1) onNavigate(currentIndex + 1)
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [entities, currentIndex, onNavigate])

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const hasList = entities && entities.length > 1 && onNavigate !== undefined && currentIndex !== undefined

  // Derive title/icon
  let Icon = FiFileText
  let title = "Document Details"
  if (entityType === 'account') { Icon = FiUser; title = "Account Details" }
  else if (entityType === 'package') { Icon = FiBox; title = "Package Details" }
  else if (entityType === 'purchaseorder') { Icon = FiTruck; title = "Purchase Order" }
  else if (entityType === 'vendor') { Icon = FiUser; title = "Vendor Details" }
  else if (entityType === 'product') { Icon = FiBox; title = "Product Details" }
  else if (entityType === 'invoice') { Icon = FiFileText; title = "Invoice" }
  else if (entityType === 'estimate' || entityType === 'quote') { Icon = FiFileText; title = "Estimate" }
  else if (entityType === 'salesorder') { Icon = FiFileText; title = "Sales Order" }

  return createPortal(
    <div className="fixed inset-0 z-[500] overflow-hidden">
      {/* Backdrop */}
      <div 
        className={`fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-0'}`} 
        onClick={handleClose} 
      />
      
      {/* Slideout Panel — full height, slides from right */}
      <div 
        className={`fixed inset-y-0 right-0 w-full max-w-5xl bg-[#0a0b0d] border-l border-white/10 shadow-2xl flex flex-col transform transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${isVisible ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="bg-[#111316] px-4 sm:px-6 py-3 border-b border-white/10 flex justify-between items-center gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-2">
              <Icon className="shrink-0 text-orange-500" size={16} />
              <h2 className="text-sm font-bold text-white truncate">{title}</h2>
            </div>
            
            {hasList && (
              <div className="flex items-center gap-1 bg-black/30 border border-white/10 rounded-lg p-0.5 shrink-0">
                <button
                  onClick={() => onNavigate!(currentIndex! - 1)}
                  disabled={currentIndex === 0}
                  className="p-1.5 rounded text-neutral-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <FiChevronLeft size={14} />
                </button>
                <span className="text-[10px] font-bold text-neutral-400 px-1.5 tabular-nums">
                  {currentIndex! + 1} / {entities!.length}
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
          
          <div className="flex items-center gap-2 shrink-0">
            {['invoice', 'estimate', 'quote', 'salesorder'].includes(entityType) && (
              <button 
                onClick={() => { /* flipbook */ }}
                className="bg-neutral-800 hover:bg-neutral-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition-colors border border-neutral-700 flex items-center gap-1.5 cursor-pointer"
              >
                <FiBookOpen size={12} /> Flipbook
              </button>
            )}
            <button 
              onClick={handleClose} 
              className="text-neutral-400 hover:text-white bg-neutral-800 hover:bg-neutral-700 transition-colors rounded-lg w-8 h-8 flex items-center justify-center font-bold text-lg cursor-pointer shrink-0 border border-neutral-700"
            >
              &times;
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {['invoice', 'estimate', 'quote', 'salesorder'].includes(entityType) ? (
            <DocumentPopoutContent 
              entityId={entityId} 
              entityType={entityType as any} 
              onClose={handleClose} 
              entities={entities} 
              currentIndex={currentIndex} 
              onNavigate={onNavigate} 
            />
          ) : entityType === 'account' ? (
            <div className="p-6 text-white">Account Content (Coming Soon)</div>
          ) : entityType === 'package' ? (
            <div className="p-6 text-white">Package Content (Coming Soon)</div>
          ) : entityType === 'purchaseorder' ? (
            <div className="p-6 text-white">Purchase Order Content (Coming Soon)</div>
          ) : entityType === 'vendor' ? (
            <div className="p-6 text-white">Vendor Content (Coming Soon)</div>
          ) : entityType === 'product' ? (
            <div className="p-6 text-white">Product Content (Coming Soon)</div>
          ) : (
            <div className="p-6 text-white">Content for {entityType}</div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}


