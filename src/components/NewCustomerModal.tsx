"use client"

import React, { useState } from 'react'
import { FiX, FiUserPlus, FiMapPin, FiBriefcase } from 'react-icons/fi'
import { toast } from 'react-hot-toast';

type NewCustomerModalProps = {
  isOpen: boolean
  onClose: () => void
  currentUserId: string | undefined
}

export function NewCustomerModal({ isOpen, onClose, currentUserId }: NewCustomerModalProps) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    accountName: '', phone: '', email: '', industry: '', tags: '',
    firstName: '', lastName: '', contactEmail: '', contactPhone: '',
    billingStreet: '', billingCity: '', billingState: '', billingCode: '', billingCountry: 'U.S.A',
    shippingStreet: '', shippingCity: '', shippingState: '', shippingCode: '', shippingCountry: 'U.S.A',
  })
  const [sameAsBilling, setSameAsBilling] = useState(true)

  if (!isOpen) return null

  const handleCopyBillingToShipping = () => {
    setFormData(prev => ({
      ...prev,
      shippingStreet: prev.billingStreet,
      shippingCity: prev.billingCity,
      shippingState: prev.billingState,
      shippingCode: prev.billingCode,
      shippingCountry: prev.billingCountry,
    }))
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    
    const payload = { ...formData, repId: currentUserId }
    if (sameAsBilling) {
      payload.shippingStreet = formData.billingStreet
      payload.shippingCity = formData.billingCity
      payload.shippingState = formData.billingState
      payload.shippingCode = formData.billingCode
      payload.shippingCountry = formData.billingCountry
    }

    try {
      const res = await fetch('/api/create-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      
      if (data.success) {
        window.location.href = `/account?id=${data.zohoId}`
      } else {
        toast.error("Failed to create customer: " + data.error)
        setLoading(false)
      }
    } catch (err) {
      console.error(err)
      toast.error("An error occurred")
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[10000] flex justify-end">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-2xl bg-neutral-900 h-full flex flex-col shadow-2xl z-[10001] animate-slide-in-right">
        {/* Header */}
        <div className="bg-neutral-850 px-6 py-4 border-b border-neutral-800 flex justify-between items-center shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <FiUserPlus className="text-amber-500" /> New Customer
            </h2>
            <p className="text-xs text-neutral-400 mt-1">Create a new Account & Contact in Zoho</p>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-white p-2 bg-neutral-800 hover:bg-neutral-750 transition-colors rounded-full flex items-center justify-center font-bold">
            <FiX size={20} />
          </button>
        </div>

        {/* Scrollable Form */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
          <form id="new-customer-form" onSubmit={handleSubmit} className="space-y-8">
            
            {/* Account Info */}
            <section>
              <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-2 mb-4 border-b border-neutral-800 pb-2">
                <FiBriefcase className="text-blue-400" /> Company / Account Info
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-neutral-400 uppercase mb-1">Company / Account Name *</label>
                  <input required name="accountName" value={formData.accountName} onChange={handleChange} className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500" placeholder="e.g. Titan Diamond LLC" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-400 uppercase mb-1">Company Phone</label>
                  <input name="phone" value={formData.phone} onChange={handleChange} className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500" placeholder="(555) 555-5555" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-400 uppercase mb-1">Company Email</label>
                  <input type="email" name="email" value={formData.email} onChange={handleChange} className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500" placeholder="sales@example.com" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-400 uppercase mb-1">Industry</label>
                  <input name="industry" value={formData.industry} onChange={handleChange} className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500" placeholder="e.g. Construction" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-400 uppercase mb-1">Tags (Comma separated)</label>
                  <input name="tags" value={formData.tags} onChange={handleChange} className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500" placeholder="VIP, Wholesale" />
                </div>
              </div>
            </section>

            {/* Primary Contact Info */}
            <section>
              <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-2 mb-4 border-b border-neutral-800 pb-2">
                <FiUserPlus className="text-emerald-400" /> Primary Contact
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-neutral-400 uppercase mb-1">First Name</label>
                  <input name="firstName" value={formData.firstName} onChange={handleChange} className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500" placeholder="John" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-400 uppercase mb-1">Last Name</label>
                  <input name="lastName" value={formData.lastName} onChange={handleChange} className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500" placeholder="Doe" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-400 uppercase mb-1">Contact Phone</label>
                  <input name="contactPhone" value={formData.contactPhone} onChange={handleChange} className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500" placeholder="(555) 555-1234" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-400 uppercase mb-1">Contact Email</label>
                  <input type="email" name="contactEmail" value={formData.contactEmail} onChange={handleChange} className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500" placeholder="john@example.com" />
                </div>
              </div>
            </section>

            {/* Address Info */}
            <section>
              <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-2 mb-4 border-b border-neutral-800 pb-2">
                <FiMapPin className="text-purple-400" /> Address Details
              </h3>
              
              <div className="mb-6">
                <h4 className="text-xs font-bold text-white mb-3">Billing Address</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <input name="billingStreet" value={formData.billingStreet} onChange={handleChange} className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500" placeholder="Street Address" />
                  </div>
                  <div>
                    <input name="billingCity" value={formData.billingCity} onChange={handleChange} className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500" placeholder="City" />
                  </div>
                  <div>
                    <input name="billingState" value={formData.billingState} onChange={handleChange} className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500" placeholder="State/Province" />
                  </div>
                  <div>
                    <input name="billingCode" value={formData.billingCode} onChange={handleChange} className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500" placeholder="Zip/Postal Code" />
                  </div>
                  <div>
                    <input name="billingCountry" value={formData.billingCountry} onChange={handleChange} className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500" placeholder="Country" />
                  </div>
                </div>
              </div>

              <div className="mb-3 flex items-center gap-2">
                <input 
                  type="checkbox" 
                  id="sameAsBilling" 
                  checked={sameAsBilling} 
                  onChange={(e) => {
                    setSameAsBilling(e.target.checked)
                    if (e.target.checked) handleCopyBillingToShipping()
                  }}
                  className="w-4 h-4 rounded bg-neutral-800 border-neutral-700 text-amber-500 focus:ring-amber-500"
                />
                <label htmlFor="sameAsBilling" className="text-sm text-neutral-300 select-none">Shipping address is the same as billing</label>
              </div>

              {!sameAsBilling && (
                <div>
                  <h4 className="text-xs font-bold text-white mb-3">Shipping Address</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <input name="shippingStreet" value={formData.shippingStreet} onChange={handleChange} className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500" placeholder="Street Address" />
                    </div>
                    <div>
                      <input name="shippingCity" value={formData.shippingCity} onChange={handleChange} className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500" placeholder="City" />
                    </div>
                    <div>
                      <input name="shippingState" value={formData.shippingState} onChange={handleChange} className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500" placeholder="State/Province" />
                    </div>
                    <div>
                      <input name="shippingCode" value={formData.shippingCode} onChange={handleChange} className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500" placeholder="Zip/Postal Code" />
                    </div>
                    <div>
                      <input name="shippingCountry" value={formData.shippingCountry} onChange={handleChange} className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500" placeholder="Country" />
                    </div>
                  </div>
                </div>
              )}
            </section>
          </form>
        </div>

        {/* Footer */}
        <div className="p-5 bg-neutral-900 border-t border-neutral-800 flex justify-end gap-3 shrink-0">
          <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-lg text-sm font-bold text-white bg-neutral-800 hover:bg-neutral-700 transition-colors">
            Cancel
          </button>
          <button 
            type="submit" 
            form="new-customer-form"
            disabled={loading || !formData.accountName}
            className="px-6 py-2.5 rounded-lg text-sm font-bold text-black bg-amber-500 hover:bg-amber-400 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {loading ? "Creating..." : "Create Customer"}
          </button>
        </div>
      </div>
    </div>
  )
}

