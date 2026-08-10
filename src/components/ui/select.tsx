'use client'
import React from 'react'

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean
  onValueChange?: (value: string) => void
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className = '', error, onValueChange, onChange, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      onChange?.(e)
      onValueChange?.(e.target.value)
    }
    return (
      <select
        ref={ref}
        aria-invalid={error ? "true" : "false"}
        className={`td-select ${error ? 'border-danger focus:border-danger' : ''} ${className}`.trim()}
        onChange={handleChange}
        {...props}
      />
    )
  }
)
Select.displayName = 'Select'

export const SelectContent = ({ children, className }: { children: React.ReactNode; className?: string }) => <>{children}</>;
export const SelectItem = ({ children, ...props }: React.OptionHTMLAttributes<HTMLOptionElement>) => <option {...props}>{children}</option>;
export const SelectTrigger = ({ children, className }: { children: React.ReactNode; className?: string }) => <>{children}</>;
export const SelectValue = ({ children, placeholder }: { children?: React.ReactNode; placeholder?: string }) => <>{children}</>;
