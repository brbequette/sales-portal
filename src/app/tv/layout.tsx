"use client"

import { useEffect, useState } from 'react'

export default function TVLayout({ children }: { children: React.ReactNode }) {
  const [showCursor, setShowCursor] = useState(true)
  
  useEffect(() => {
    let timeout: NodeJS.Timeout
    const handleMouseMove = () => {
      setShowCursor(true)
      clearTimeout(timeout)
      timeout = setTimeout(() => setShowCursor(false), 3000)
    }
    window.addEventListener('mousemove', handleMouseMove)
    timeout = setTimeout(() => setShowCursor(false), 3000)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      clearTimeout(timeout)
    }
  }, [])

  return (
    <div className={`h-dvh min-h-dvh overflow-hidden bg-black ${!showCursor ? 'cursor-none' : ''}`}>
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      {children}
    </div>
  )
}

