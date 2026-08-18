'use client'
import React from 'react'

export interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ icon, title, description, action, className = '' }, ref) => {
    return (
      <div
        ref={ref}
        className={`flex flex-col items-center justify-center p-8 text-center min-h-[300px] border border-dashed border-border rounded-xl bg-surface-2/50 ${className}`}
      >
        {icon && <div className="mb-4 text-muted-2 text-4xl">{icon}</div>}
        <h3 className="text-lg font-bold text-foreground mb-1">{title}</h3>
        {description && <p className="text-sm text-muted-2 mb-4 max-w-sm">{description}</p>}
        {action && <div>{action}</div>}
      </div>
    )
  }
)
EmptyState.displayName = 'EmptyState'
