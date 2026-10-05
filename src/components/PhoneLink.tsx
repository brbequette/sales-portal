"use client"

import React from 'react'
import { FiPhone, FiMessageSquare } from 'react-icons/fi'
import { formatPhoneNumber } from '@/lib/formatters'

export interface PhoneLinkProps {
  phone: string
  className?: string
  icon?: boolean
  showNumberOnDesktop?: boolean
  children?: React.ReactNode
  type?: 'phone' | 'sms'
  onBeforeCall?: (phone: string) => void
  subLabel?: React.ReactNode
  accountId?: string
  accountName?: string
  contactId?: string
  contactName?: string
}

/** All screen sizes use the persistent in-app communication workspace. */
export function PhoneLink({ phone, className = '', icon = false, children, type = 'phone', onBeforeCall, subLabel, accountId, accountName, contactId, contactName }: PhoneLinkProps) {
  if (!phone) return null
  const cleanPhone = phone.replace(/[^\d+]/g, '')
  const isSms = type === 'sms'
  return <button type="button" title={`${isSms ? 'Message' : 'Call'} in Titan: ${cleanPhone}`} onClick={event => {
    event.preventDefault(); event.stopPropagation()
    if (!isSms) onBeforeCall?.(cleanPhone)
    window.dispatchEvent(new CustomEvent(isSms ? 'titan:open-messages' : 'inAppDial', { detail: { phone: cleanPhone, accountId, accountName, contactId, contactName } }))
  }} className={`inline-flex items-center gap-2 hover:text-cyan-300 transition-colors ${className}`}>
    {children || (icon && (isSms ? <FiMessageSquare className="shrink-0" /> : <FiPhone className="shrink-0" />))}
    <span className="flex flex-col text-left leading-tight"><span className="font-mono text-xs font-bold">{formatPhoneNumber(phone) || phone.trim()}</span>{subLabel && <span className="text-[10px] text-neutral-400 truncate max-w-[200px]">{subLabel}</span>}</span>
  </button>
}
