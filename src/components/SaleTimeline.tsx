"use client"


import React, { useEffect, useState } from 'react'
import { FiCheck, FiBookOpen } from 'react-icons/fi'
import { toast } from 'react-hot-toast'

interface SalesStage {
  id: string
  name: string
  slug: string
  order: number
  color: string
}

interface SaleTimelineProps {
  dealId: string
  currentStage: string
}

export function SaleTimeline({ dealId, currentStage }: SaleTimelineProps) {
  const [stages, setStages] = useState<SalesStage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchStages() {
      try {
        const res = await fetch('/api/admin/sales-stages')
        const data = await res.json()
        if (data.success && data.stages) {
          setStages(data.stages)
        }
      } catch (err) {
        console.error('Failed to fetch stages:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchStages()
  }, [])

  if (loading) {
    return <div className="text-neutral-500 text-xs mt-4 animate-pulse">Loading timeline...</div>
  }

  if (stages.length === 0) {
    return null
  }

  // Find the index of the current stage
  let currentIndex = stages.findIndex(s => s.name.toLowerCase() === currentStage.toLowerCase())
  if (currentIndex === -1) {
    const matchedIndex = stages.findIndex(s => currentStage.toLowerCase().includes(s.name.toLowerCase()))
    if (matchedIndex !== -1) currentIndex = matchedIndex
  }
  
  // If no match is found, perhaps it's a Won/Lost scenario not in stages.
  // We just let currentIndex be -1, but maybe highlight the end if Won.
  if (currentIndex === -1 && currentStage.toLowerCase().includes('won')) {
    currentIndex = stages.length
  }

  const handleTrainingClick = (stageName: string, e: React.MouseEvent) => {
    e.stopPropagation()
    toast(`Opening training materials for: ${stageName}`, {
      icon: 'ðŸ“š'
    })
  }

  return (
    <div className="mt-4 pt-4 border-t border-neutral-700/50 w-full overflow-x-auto scrollbar-thin">
      <div className="flex items-start min-w-[max-content] pb-2">
        {stages.map((stage, index) => {
          const isCompleted = currentIndex !== -1 && index < currentIndex
          const isCurrent = index === currentIndex

          return (
            <div key={stage.id} className="relative flex flex-col items-center group w-24">
              {/* Connector Line */}
              {index !== stages.length - 1 && (
                <div className={`absolute top-4 left-[50%] w-full h-[2px] ${
                  isCompleted ? 'bg-emerald-500' : 'bg-neutral-700'
                }`} />
              )}
              
              {/* Circle */}
              <div className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors bg-neutral-900 ${
                isCompleted ? 'bg-emerald-900/40 border-emerald-500 text-emerald-500' :
                isCurrent ? 'bg-blue-900/40 border-blue-500 text-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.3)]' :
                'bg-neutral-800 border-neutral-600 text-neutral-500'
              }`}>
                {isCompleted ? <FiCheck size={14} /> : <span className="text-xs font-bold">{index + 1}</span>}
              </div>

              {/* Stage Name */}
              <div className={`mt-2 text-[10px] font-bold uppercase tracking-wider text-center px-1 ${
                isCompleted ? 'text-emerald-500' :
                isCurrent ? 'text-blue-400' :
                'text-neutral-500'
              }`}>
                {stage.name}
              </div>

              {/* Training Button */}
              <button 
                onClick={(e) => handleTrainingClick(stage.name, e)}
                className="mt-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-[10px] font-bold uppercase bg-neutral-800 hover:bg-emerald-600 hover:text-white text-neutral-300 px-2 py-1 rounded-md"
              >
                <FiBookOpen size={10} />
                <span>Train</span>
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

