'use client'
import React from 'react'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', error, disabled, ...props }, ref) => {
    return (
      <input
        ref={ref}
        disabled={disabled}
        aria-invalid={error ? "true" : "false"}
        className={`td-input ${error ? 'border-danger focus:border-danger' : ''} ${className}`.trim()}
        {...props}
      />
    )
  }
)
Input.displayName = 'Input'
