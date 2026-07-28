"use client"

import React, { useState, useEffect } from 'react'
import { FiPhone, FiCheck, FiMessageSquare } from 'react-icons/fi'
import { toast } from 'react-hot-toast'

export interface PhoneLinkProps {
  phone: string
  className?: string
  icon?: boolean
  showNumberOnDesktop?: boolean
  children?: React.ReactNode
  type?: 'phone' | 'sms'
  onBeforeCall?: (phone: string) => void
}

/**
 * Responsive Click-to-Dial / Click-to-SMS ZDialer Component.
 * 
 * Desktop: Clipboard copy & ZDialer Extension detection tags (`data-zohovoice="true"` / `data-zohovoice-sms="true"`).
 * Mobile:  Native `tel:` or `sms:` protocol link.
 */
export function PhoneLink({ 
  phone, 
  className = "", 
  icon = false, 
  showNumberOnDesktop = false,
  children, 
  type = 'phone',
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
  const isSms = type === 'sms'

  const handleDesktopClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onBeforeCall?.(cleanPhone)

    // Trigger ZDialer window API if present
    if (typeof window !== 'undefined') {
      const win = window as any
      if (isSms && win.ZDialer?.sendSMS) {
        try { win.ZDialer.sendSMS(cleanPhone); return; } catch (err) {}
      }
      if (isSms && win.ZohoVoice?.sendSMS) {
        try { win.ZohoVoice.sendSMS(cleanPhone); return; } catch (err) {}
      }
      if (!isSms && win.ZDialer?.dial) {
        try { win.ZDialer.dial(cleanPhone); } catch (err) {}
      }
    }

    if (navigator.clipboard) {
      navigator.clipboard.writeText(cleanPhone)
      setCopied(true)
      const actionText = isSms ? 'ZDialer SMS' : 'ZDialer Call'
      const iconEmoji = isSms ? '💬' : '📞'
      toast.success(`Copied for ${actionText}: ${cleanPhone}`, { duration: 2500, icon: iconEmoji })
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // 1. Mobile view: Native tel: or sms: link
  if (isMobile) {
    const href = isSms ? `sms:${cleanPhone}` : `tel:${cleanPhone}`
    return (
      <a 
        href={href}
        data-zohovoice="true"
        data-zohovoice-sms={isSms ? "true" : undefined}
        data-zohovoice-type={isSms ? "sms" : "call"}
        data-phone-number={cleanPhone}
        className={`inline-flex items-center gap-1.5 hover:text-emerald-400 transition-colors ${className}`}
        onClick={() => onBeforeCall?.(cleanPhone)}
      >
        {children ? children : (
          <>
            {icon && (isSms ? <FiMessageSquare className="shrink-0" /> : <FiPhone className="shrink-0" />)}
            <span className="font-mono font-bold">{displayPhone}</span>
          </>
        )}
      </a>
    )
  }

  // 2. Desktop view: Plain text for ZDialer Chrome Extension + Copy & API trigger
  return (
    <span
      data-zohovoice="true"
      data-zohovoice-sms={isSms ? "true" : undefined}
      data-zohovoice-type={isSms ? "sms" : "call"}
      data-phone-number={cleanPhone}
      onClick={handleDesktopClick}
      title={isSms ? `ZDialer SMS: ${cleanPhone} (Click to open / copy)` : `ZDialer Call: ${cleanPhone} (Click to copy)`}
      className={`inline-flex items-center gap-1.5 cursor-pointer font-mono font-bold tracking-wide select-all transition-colors ${className}`}
    >
      {children ? (
        <span className="flex items-center gap-1.5">
          {children}
          {showNumberOnDesktop && <span className="font-mono text-xs ml-1 font-bold">{displayPhone}</span>}
        </span>
      ) : (
        <>
          {icon && (copied ? <FiCheck className="shrink-0 text-emerald-400" /> : isSms ? <FiMessageSquare className="shrink-0" /> : <FiPhone className="shrink-0" />)}
          <span>{displayPhone}</span>
        </>
      )}
    </span>
  )
}
