"use client"

import React from 'react'
import { FiPhone } from 'react-icons/fi'

interface PhoneLinkProps {
  phone: string
  className?: string
  icon?: boolean
  children?: React.ReactNode
  /** Optional callback before the call action (e.g., for analytics/logging) */
  onBeforeCall?: (phone: string) => void
}

/**
 * Unified click-to-dial component.
 * 
 * Desktop: tel: link â†’ ZDialer Chrome extension intercepts automatically.
 * Mobile:  tel: link â†’ OS app chooser lets user pick ZDialer app or native Phone.
 * 
 * The `data-zohovoice="true"` attribute gives the ZDialer extension
 * a stronger signal to intercept the link.
 */
export function PhoneLink({ phone, className = "", icon = false, children, onBeforeCall }: PhoneLinkProps) {
  if (!phone) return null

  const cleanPhone = phone.replace(/[^\d+]/g, '')

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
          <span>{phone}</span>
        </>
      )}
    </a>
  )
}

