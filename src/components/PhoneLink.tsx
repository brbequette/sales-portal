"use client"
import React, { useEffect, useState } from 'react'
import { FiPhone } from 'react-icons/fi'

interface PhoneLinkProps {
  phone: string
  className?: string
  icon?: boolean
  children?: React.ReactNode
}

export function PhoneLink({ phone, className = "", icon = false, children }: PhoneLinkProps) {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    // Basic mobile detection
    if (typeof window !== 'undefined') {
      setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent))
    }
  }, [])

  if (!phone) return null

  // Clean the phone number for the href
  const cleanPhone = phone.replace(/[^\d+]/g, '')
  
  // Desktop: Standard tel: which ZDialer Chrome extension intercepts
  // Mobile: Try zdialer:// custom scheme for the ZDialer app
  const href = isMobile ? `zdialer://${cleanPhone}` : `tel:${cleanPhone}`

  return (
    <a 
      href={href} 
      data-zohovoice="true"
      className={`inline-flex items-center gap-1.5 hover:text-emerald-400 transition-colors ${className}`}
      onClick={(e) => {
        // Optional: If zdialer fails on mobile, you could implement a fallback timeout to standard tel:
      }}
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
