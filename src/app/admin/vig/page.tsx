"use client"

import VigManagementBuilder from "@/components/VigManagementBuilder"

import { FiSettings } from "react-icons/fi"

export default function VigManagementPage() {
  return (
    <div className="page-content">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-center">
            <FiSettings className="text-amber-500" size={17} />
          </div>
          <div>
            <h1 className="page-title">VIG Management</h1>
            <p className="page-subtitle">Configure sales markup rates and exemptions</p>
          </div>
        </div>
      </div>
      <div className="page-body">
        <VigManagementBuilder />
      </div>
    </div>
  )
}
