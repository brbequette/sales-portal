'use client'
import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface DialogProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}

const DialogContext = React.createContext<{
  open: boolean
  setOpen: (open: boolean) => void
}>({ open: false, setOpen: () => {} })

export const Dialog = ({ open, onOpenChange, children }: DialogProps) => {
  const [isOpen, setIsOpen] = useState(open || false)
  
  useEffect(() => {
    if (open !== undefined) {
      setIsOpen(open)
    }
  }, [open])

  const handleSetOpen = (newOpen: boolean) => {
    setIsOpen(newOpen)
    onOpenChange?.(newOpen)
  }

  return (
    <DialogContext.Provider value={{ open: isOpen, setOpen: handleSetOpen }}>
      {children}
    </DialogContext.Provider>
  )
}

export const DialogContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className = '', children, ...props }, ref) => {
    const { open, setOpen } = React.useContext(DialogContext)
    const [mounted, setMounted] = useState(false)
    const contentRef = useRef<HTMLDivElement>(null)

    useEffect(() => { setMounted(true) }, [])

    useEffect(() => {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && open) setOpen(false)
      }
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }, [open, setOpen])

    useEffect(() => {
      if (open && contentRef.current) {
        contentRef.current.focus()
      }
    }, [open])

    if (!mounted || !open) return null

    return createPortal(
      <>
        <div 
          className="td-modal-backdrop" 
          aria-hidden="true" 
          onClick={() => setOpen(false)} 
        />
        <div className="td-modal">
          <div
            ref={(node) => {
              // @ts-ignore
              contentRef.current = node
              if (typeof ref === 'function') ref(node)
              else if (ref) ref.current = node
            }}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            className={`td-modal-inner max-w-lg ${className}`}
            {...props}
          >
            {children}
          </div>
        </div>
      </>,
      document.body
    )
  }
)
DialogContent.displayName = 'DialogContent'

export const DialogHeader = ({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={`td-modal-header ${className}`} {...props} />
)

export const DialogTitle = ({ className = '', ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h2 className={`td-modal-title ${className}`} {...props} />
)

export const DialogDescription = ({ className = '', ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
  <p className={`text-sm text-muted-2 ${className}`} {...props} />
)

export const DialogFooter = ({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={`td-modal-footer ${className}`} {...props} />
)

export const DialogClose = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className = '', ...props }, ref) => {
    const { setOpen } = React.useContext(DialogContext)
    return (
      <button
        ref={ref}
        type="button"
        className={`td-btn td-btn-ghost td-btn-sm ${className}`}
        onClick={() => setOpen(false)}
        {...props}
      />
    )
  }
)
DialogClose.displayName = 'DialogClose'
