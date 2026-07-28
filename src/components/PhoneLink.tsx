"use client"

import React, { useState, useEffect } from 'react'
import { FiPhone, FiCopy, FiCheck } from 'react-icons/fi'
import { toast } from 'react-hot-toast'

interface PhoneLinkProps {
  phone: string
  className?: string
  icon?: boolean
  showNumberOnDesktop?: boolean
  children?: React.ReactNode
  onBeforeCall?: (phone: string) => void
}

/**
 * Responsive Click-to-Dial / ZDialer Phone Component.
 * 
 * Desktop: Plain text / clipboard copy with data-zohovoice="true" for ZDialer extension detection.
 * Mobile:  Native tel: protocol link for OS/Cellular phone dialing.
 */
export function PhoneLink({ 
  phone, 
  className = "", 
  icon = false, 
  showNumberOnDesktop = false,
  children, 
  onBeforeCall 
}: PhoneLinkProps) {
  const [isMobile, setIsMobile] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      const isMob = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent) || window.innerWidth < 768
      setIsMobile(isMob)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  if (!phone) return null

  const cleanPhone = phone.replace(/[^\d+]/g, '')
  const displayPhone = phone.trim()

  const handleDesktopClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onBeforeCall?.(cleanPhone)
    if (navigator.clipboard) {
      navigator.clipboard.writeText(cleanPhone)
      setCopied(true)
      toast.success(`Copied for ZDialer: ${cleanPhone}`, { duration: 2500, icon: '📞' })
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // 1. Mobile view: Native tel: link
  if (isMobile) {
    return (
      <a 
        href={`tel:${cleanPhone}`}
        data-zohovoice="true"
        className={`inline-flex items-center gap-1.5 hover:text-emerald-400 transition-colors ${className}`}
        onClick={() => onBeforeCall?.(cleanPhone)}
      >
        {children ? children : (
          <>
            {icon && <FiPhone className="shrink-0" />}
            <span className="font-mono font-bold">{displayPhone}</span>
          </>
        )}
      </a>
    )
  }

  // 2. Desktop view: Plain text for ZDialer Chrome Extension + Copy fallback
  return (
    <span
      data-zohovoice="true"
      onClick={handleDesktopClick}
      title={`ZDialer number: ${cleanPhone} (Click to copy)`}
      className={`inline-flex items-center gap-1.5 cursor-pointer font-mono font-bold tracking-wide select-all transition-colors ${className}`}
    >
      {children ? (
        <span className="flex items-center gap-1.5">
          {children}
          {showNumberOnDesktop && <span className="font-mono text-xs ml-1 font-bold">{displayPhone}</span>}
        </span>
      ) : (
        <>
          {icon && (copied ? <FiCheck className="shrink-0 text-emerald-400" /> : <FiPhone className="shrink-0" />)}
          <span>{displayPhone}</span>
        </>
      )}
    </span>
  )
}
