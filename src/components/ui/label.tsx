'use client'
import React from 'react'

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean
}

export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className = '', required, children, ...props }, ref) => {
    return (
      <label ref={ref} className={`td-label ${className}`.trim()} {...props}>
        {children}
        {required && <span className="text-danger ml-1" aria-hidden="true">*</span>}
      </label>
    )
  }
)
Label.displayName = 'Label'
