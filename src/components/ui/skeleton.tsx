'use client'
import React from 'react'

export interface SkeletonProps {
  className?: string
  rows?: number
  height?: string
  width?: string
  variant?: 'text' | 'card' | 'circle' | 'table-row'
}

export const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className = '', rows = 1, height, width, variant = 'text' }, ref) => {
    const baseStyle = { height, width }

    let variantClass = 'skeleton'
    if (variant === 'text') variantClass += ' skeleton-text'
    if (variant === 'circle') variantClass += ' skeleton-avatar'
    if (variant === 'table-row') variantClass += ' skeleton-row'
    if (variant === 'card') {
      variantClass += ' modern-card p-4'
    }

    if (rows > 1) {
      return (
        <div ref={ref} className="space-y-2">
          {Array.from({ length: rows }).map((_, i) => (
            <div
              key={i}
              className={`${variantClass} ${className}`}
              style={baseStyle}
            />
          ))}
        </div>
      )
    }

    return (
      <div
        ref={ref}
        className={`${variantClass} ${className}`}
        style={baseStyle}
      />
    )
  }
)
Skeleton.displayName = 'Skeleton'
