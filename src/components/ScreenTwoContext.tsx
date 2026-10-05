"use client"

import { useState } from 'react'
import type { DualScreenState } from '@/lib/dual-screen'
import { screenOneFramePath } from '@/lib/communication-context'
import { InvoiceDetailsModal } from './InvoiceDetailsModal'
import { useProductModal } from './ProductModalProvider'

export function ScreenTwoContext({ state }: { state: DualScreenState | null }) {
  const [showPage, setShowPage] = useState(false)
  const [showOrder, setShowOrder] = useState(false)
  const { showProduct } = useProductModal()
  if (!state) return null
  const context = state.communication
  const path = screenOneFramePath(state.controllerPath)
  const orderType = context?.kind === 'Invoice' || context?.kind === 'SalesOrder' || context?.kind === 'Quote' ? context.kind : null
  return <section aria-label="Current screen one context" className="shrink-0 border-b border-cyan-500/20 bg-cyan-950/20 text-white">
    <div className="flex flex-wrap items-center gap-3 px-4 py-2 text-xs">
      <span className="min-w-0 flex-1 truncate"><strong className="text-cyan-300">Screen 1</strong> · {context?.title || state.title} <span className="text-neutral-400">{state.controllerPath}</span></span>
      {context?.kind === 'product' && context.productSearch && <button className="rounded-lg bg-cyan-700 px-3 py-2" onClick={() => showProduct(context.productSearch!)}>Product details & history</button>}
      {orderType && context?.recordId && <button className="rounded-lg bg-cyan-700 px-3 py-2" onClick={() => setShowOrder(true)}>Open {orderType === 'SalesOrder' ? 'customer order' : orderType.toLowerCase()}</button>}
      {path && <button aria-expanded={showPage} className="rounded-lg bg-white/10 px-3 py-2" onClick={() => setShowPage(value => !value)}>{showPage ? 'Hide screen 1 workspace' : 'Open screen 1 workspace'}</button>}
    </div>
    {showPage && path && <iframe key={path} title="Screen one workspace" src={path} className="h-[42dvh] w-full border-0 bg-black" />}
    {showOrder && orderType && context?.recordId && <InvoiceDetailsModal key={context.recordId} invoice={context.recordId} type={orderType} onClose={() => setShowOrder(false)} />}
  </section>
}
