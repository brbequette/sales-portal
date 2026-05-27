"use client"

import { useState } from "react"

export function InvoiceFlipbook({ invoices }: { invoices: any[] }) {
  const [currentIndex, setCurrentIndex] = useState(0)

  if (!invoices || invoices.length === 0) {
    return <div className="text-sm text-gray-500 italic p-4">No past invoices available.</div>
  }

  const currentInvoice = invoices[currentIndex]

  const nextInvoice = () => {
    if (currentIndex < invoices.length - 1) setCurrentIndex(currentIndex + 1)
  }

  const prevInvoice = () => {
    if (currentIndex > 0) setCurrentIndex(currentIndex - 1)
  }

  return (
    <div className="bg-white text-black p-6 rounded-lg shadow-xl relative w-full max-w-md mx-auto aspect-[3/4] flex flex-col transform transition-transform duration-500 ease-in-out">
      <div className="absolute top-2 right-4 text-xs font-bold text-gray-400">
        Page {currentIndex + 1} of {invoices.length}
      </div>
      
      {/* Invoice Header */}
      <div className="border-b-2 border-gray-200 pb-4 mb-4 flex justify-between items-start mt-4">
        <div>
          <h2 className="text-xl font-bold text-blue-900">Titan Diamond</h2>
          <p className="text-xs text-gray-500">Invoice {currentInvoice.zohoId || currentInvoice.id}</p>
        </div>
        <div className="text-right">
          <div className={`text-sm font-bold px-2 py-1 rounded inline-block ${currentInvoice.status === 'Paid' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
            {currentInvoice.status || 'Paid'}
          </div>
        </div>
      </div>

      {/* Invoice Details */}
      <div className="flex-1 space-y-4">
        <div className="flex justify-between text-sm">
          <span className="font-semibold text-gray-600">Issue Date:</span>
          <span>{new Date(currentInvoice.issueDate || currentInvoice.date).toLocaleDateString()}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="font-semibold text-gray-600">Due Date:</span>
          <span>{currentInvoice.dueDate ? new Date(currentInvoice.dueDate).toLocaleDateString() : 'N/A'}</span>
        </div>
        
        <div className="mt-6 border-t border-gray-100 pt-4">
          <h3 className="font-semibold text-sm mb-2 text-gray-700">Line Items</h3>
          <ul className="text-xs text-gray-600 space-y-1 list-disc pl-4">
            {currentInvoice.items ? currentInvoice.items.map((item: any, i: number) => (
              <li key={i}>{item.name || item}</li>
            )) : <li>Standard Product Assortment</li>}
          </ul>
        </div>
      </div>

      {/* Invoice Footer */}
      <div className="border-t-2 border-gray-200 pt-4 mt-auto flex justify-between items-end">
        <span className="text-sm font-bold text-gray-600">Total Amount:</span>
        <span className="text-2xl font-bold text-blue-900">${parseFloat(currentInvoice.amount).toLocaleString()}</span>
      </div>

      {/* Navigation Controls */}
      <div className="absolute -bottom-12 left-0 right-0 flex justify-center gap-4">
        <button 
          onClick={prevInvoice} 
          disabled={currentIndex === 0}
          className="bg-gray-800 text-white px-3 py-1 rounded-full disabled:opacity-30 hover:bg-blue-600 transition-colors"
        >
          &larr; Prev
        </button>
        <button 
          onClick={nextInvoice} 
          disabled={currentIndex === invoices.length - 1}
          className="bg-gray-800 text-white px-3 py-1 rounded-full disabled:opacity-30 hover:bg-blue-600 transition-colors"
        >
          Next &rarr;
        </button>
      </div>
    </div>
  )
}
