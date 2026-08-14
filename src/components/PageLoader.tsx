"use client"

export default function PageLoader({ title }: { title?: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] animate-fade-in">
      <div className="relative mb-6">
        {/* Pulsing ring */}
        <div className="w-16 h-16 rounded-full border-2 border-orange-500/20 animate-ping absolute inset-0" />
        {/* Spinning ring */}
        <div className="w-16 h-16 rounded-full border-2 border-transparent border-t-orange-500 animate-spin" />
        {/* Center dot */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-3 h-3 rounded-full bg-orange-500 animate-pulse" />
        </div>
      </div>
      {title && <p className="text-sm font-medium text-neutral-400 tracking-wide">{title}</p>}
      <div className="mt-6 flex gap-1.5">
        <div className="w-1.5 h-1.5 rounded-full bg-orange-500/60 animate-bounce" style={{ animationDelay: '0ms' }} />
        <div className="w-1.5 h-1.5 rounded-full bg-orange-500/60 animate-bounce" style={{ animationDelay: '150ms' }} />
        <div className="w-1.5 h-1.5 rounded-full bg-orange-500/60 animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  )
}
