'use client'
import React, { useRef } from 'react'

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean
  autoResize?: boolean
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className = '', error, autoResize, onChange, ...props }, ref) => {
    const internalRef = useRef<HTMLTextAreaElement | null>(null)
    
    const setRefs = (element: HTMLTextAreaElement | null) => {
      internalRef.current = element
      if (typeof ref === 'function') {
        ref(element)
      } else if (ref) {
        ref.current = element
      }
    }

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (autoResize && internalRef.current) {
        internalRef.current.style.height = 'auto'
        internalRef.current.style.height = `${internalRef.current.scrollHeight}px`
      }
      onChange?.(e)
    }

    return (
      <textarea
        ref={setRefs}
        aria-invalid={error ? "true" : "false"}
        className={`td-textarea ${error ? 'border-danger focus:border-danger' : ''} ${className}`.trim()}
        onChange={handleChange}
        {...props}
      />
    )
  }
)
Textarea.displayName = 'Textarea'
