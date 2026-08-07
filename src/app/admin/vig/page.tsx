"use client"

import VigManagementBuilder from "@/components/VigManagementBuilder"

export default function VigManagementPage() {
  return (
    <div className="flex flex-col text-neutral-100 font-sans h-full">
      <main className="flex-1 p-4 sm:p-6 overflow-y-auto safe-bottom">
        <VigManagementBuilder />
      </main>
    </div>
  )
}
