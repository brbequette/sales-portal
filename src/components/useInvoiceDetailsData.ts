"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useSession } from "next-auth/react"
import { useZoho } from "@/components/ZohoProvider"
import { usePreferences } from "@/components/PreferencesProvider"
import { isItemExemptFromVig } from "@/lib/custom-field-extractor"

export interface InvoiceDetailsModalProps {
  invoice: any | string;
  type?: "Quote" | "SalesOrder" | "Invoice";
  onClose: () => void;
  invoiceList?: any[];
  currentIndex?: number;
  onNavigate?: (index: number) => void;
}

export function useInvoiceDetailsData({ invoice, type = "Invoice", onClose, invoiceList, currentIndex, onNavigate }: InvoiceDetailsModalProps) {

  const { data: session } = useSession()
  const { zohoContext: user } = useZoho()
  const { preferences } = usePreferences()
  const [internalInvoiceOverride, setInternalInvoiceOverride] = useState<any | null>(null)
  const [internalTypeOverride, setInternalTypeOverride] = useState<"Quote" | "SalesOrder" | "Invoice" | null>(null)
  const [fullInvoiceDetails, setFullInvoiceDetails] = useState<any | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [dataSource, setDataSource] = useState<'zoho_live' | 'local_db' | null>(null)
  const [cachedAt, setCachedAt] = useState<string | null>(null)
  const [isConverting, setIsConverting] = useState(false)
  const [actionLoading, setActionLoading] = useState("")
  // Cost processing result stored inline (replaces alert)
  const [costResult, setCostResult] = useState<any | null>(null)
  
  // Modals state
  const [showPackageModal, setShowPackageModal] = useState(false)
  const [showDropshipmentModal, setShowDropshipmentModal] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  
  // Tabs state
  const [activeTab, setActiveTab] = useState<'overview' | 'financials' | 'communications' | 'notes_tasks' | 'pdf_preview'>('overview')
  
  // Discount state
  const [discountPercentage, setDiscountPercentage] = useState<number>(5)

  const [usersList, setUsersList] = useState<any[]>([])
  const [isLoadingUsers, setIsLoadingUsers] = useState(true)
  
  useEffect(() => {
    fetch('/api/admin/users')
      .then(res => {
        if (!res.ok) throw new Error(`Failed to load users: ${res.status}`)
        return res.json()
      })
      .then(data => {
        if (data.users) {
          setUsersList(data.users)
        }
        setIsLoadingUsers(false)
      })
      .catch((err) => {
        console.error('Failed to load users list:', err)
        setIsLoadingUsers(false)
      })
  }, [])

  // Line item editing state
  const [isEditingLineItems, setIsEditingLineItems] = useState(false)
  const [editableLineItems, setEditableLineItems] = useState<any[]>([])
  const [isSavingLineItems, setIsSavingLineItems] = useState(false)
  const [productsCatalog, setProductsCatalog] = useState<any[]>([])
  const [selectedProductId, setSelectedProductId] = useState("")
  const [newProductQty, setNewProductQty] = useState(1)
  const [newProductPrice, setNewProductPrice] = useState(0)
  const [productSearch, setProductSearch] = useState("")
  const [showProductDropdown, setShowProductDropdown] = useState(false)

  const filteredProducts = useMemo(() => {
    if (!productSearch) return productsCatalog
    const query = productSearch.toLowerCase()
    return productsCatalog.filter(
      p =>
        (p.name && p.name.toLowerCase().includes(query)) ||
        (p.sku && p.sku.toLowerCase().includes(query))
    )
  }, [productSearch, productsCatalog])

  const getVigAndGiftStatus = useCallback((item: any) => {
    const calcDetail = fullInvoiceDetails?.items?.lineItemDetails?.find((d: any) => 
      (d.sku && item.sku && d.sku.toLowerCase().trim() === item.sku.toLowerCase().trim()) ||
      (d.name && item.name && d.name.toLowerCase().trim() === item.name.toLowerCase().trim())
    )
    if (calcDetail) {
      return { isExempt: calcDetail.noVig, isGift: calcDetail.gift }
    }

    const itemSku = (item.sku || item.code || "").toLowerCase().trim()
    const itemName = (item.name || "").toLowerCase().trim()
    const prod = productsCatalog.find(p => 
      p.sku?.toLowerCase().trim() === itemSku || 
      p.name?.toLowerCase().trim() === itemName
    )
    if (prod) {
      const isGift = prod.giftItem === true
      const isExempt = prod.subjectToVig === false || prod.giftItem === true || isItemExemptFromVig(item)
      return { isExempt, isGift }
    }

    return { isExempt: isItemExemptFromVig(item), isGift: false }
  }, [fullInvoiceDetails, productsCatalog])

  useEffect(() => {
    if (isEditingLineItems && productsCatalog.length === 0) {
      fetch("/api/get-products")
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            const activeProducts = (data.products || [])
              .map((p: any) => {
                try {
                  const desc = JSON.parse(p.description || "{}")
                  return { ...p, zohoId: desc.itemId, status: desc.status }
                } catch {
                  return { ...p, zohoId: undefined, status: "active" }
                }
              })
              .filter((p: any) => p.status !== "inactive")
            setProductsCatalog(activeProducts)
          }
        })
        .catch(err => console.error("Failed to load products", err))
    }
  }, [isEditingLineItems, productsCatalog.length])

  // Determine the base zoho ID and any existing data
  const currentInvoice = internalInvoiceOverride || invoice
  const currentType = internalTypeOverride || type

  const isString = typeof currentInvoice === "string"
  const zohoId = isString ? currentInvoice : (currentInvoice?.zohoId || currentInvoice?.id)
  const initialData = isString ? { id: zohoId, zohoId } : currentInvoice

  const fetchDetails = useCallback(async (force = false) => {
    if (!zohoId) return
    // Only show the loading spinner when there's no data yet (initial open)
    // For force refreshes, show a spinning indicator on the button instead
    if (!fullInvoiceDetails) setIsLoading(true)
    try {
      const url = `/api/get-invoice-details?targetId=${zohoId}&type=${currentType}${force ? '&force=true' : ''}`
      const res = await fetch(url)
      const data = await res.json()
      if (data.success && (data.invoice || data.document || data.salesorder || data.estimate)) {
        const doc = data.invoice || data.document || data.salesorder || data.estimate
        setFullInvoiceDetails(doc)
        setDataSource(data._source === 'local_db' ? 'local_db' : 'zoho_live')
        setCachedAt(doc._cachedAt || null)

        // Proactive cost calculation if deadCostTotal is missing/null/0
        const statusLower = (doc.status || '').toLowerCase()
        if (statusLower !== 'void' && statusLower !== 'voided' && statusLower !== 'draft') {
          const items = doc.items || {}
          const deadCost = parseFloat(items.deadCostTotal || 0)
          if (isNaN(deadCost) || deadCost === 0) {
            setTimeout(() => {
              handleProcessCosts(true)
            }, 100)
          }
        }
      }
    } catch (e) {
      console.error("Failed to load full document details", e)
    } finally {
      setIsLoading(false)
    }
  }, [zohoId, currentType, fullInvoiceDetails])

  useEffect(() => {
    if (!zohoId) return;

    // If it already has custom fields, seed it immediately (no spinner)
    if (!isString && currentInvoice?.items?.custom_fields) {
      setFullInvoiceDetails({ custom_fields: currentInvoice.items.custom_fields, ...currentInvoice })
    } else {
      // Clear old details while fetching new
      setFullInvoiceDetails(null)
    }

    fetchDetails(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zohoId, currentType])

  // Keyboard navigation: left/right arrows when a list is provided
  const hasList = invoiceList && invoiceList.length > 1 && onNavigate !== undefined && currentIndex !== undefined
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!hasList) return
    if (e.key === "ArrowLeft" && currentIndex! > 0) onNavigate!(currentIndex! - 1)
    if (e.key === "ArrowRight" && currentIndex! < invoiceList!.length - 1) onNavigate!(currentIndex! + 1)
    if (e.key === "Escape") onClose()
  }, [hasList, currentIndex, invoiceList, onNavigate, onClose])

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])

  const displayData = fullInvoiceDetails || initialData

  const effectiveRole = preferences?.impersonatedUser ? preferences.impersonatedUser.role : (user?.role || "")
  const effectiveEmail = preferences?.impersonatedUser ? preferences.impersonatedUser.email : (user?.email || "")
  const effectiveName = preferences?.impersonatedUser ? preferences.impersonatedUser.name : (user?.name || "")

  const normalizedRole = effectiveRole.toLowerCase()
  const isAdmin = normalizedRole.includes("admin") || normalizedRole === "administrator" || normalizedRole.includes("collections") || normalizedRole.includes("manager")
  const isSalesOrderInvoiced = 
    currentType === "SalesOrder" && 
    (displayData?.status?.toLowerCase() === "invoiced" || 
     displayData?.invoiced === true || 
     (displayData?.invoices && displayData.invoices.length > 0))

  const spName = (displayData?.salesperson_name || displayData?.salespersonName || "").toLowerCase().trim()
  const matchedRep = usersList.find(u => u.name.toLowerCase().trim() === spName || u.zohoName?.toLowerCase().trim() === spName)
  const isSalespersonOwner = 
    spName && 
    ((matchedRep && matchedRep.email?.toLowerCase().trim() === effectiveEmail.toLowerCase().trim()) || 
     (spName === effectiveName.toLowerCase().trim()))

  const canEdit = isAdmin || (isSalespersonOwner && currentType === "SalesOrder" && !isSalesOrderInvoiced)

  const handleConvert = useCallback(async (targetType: "SalesOrder" | "Invoice") => {
    setIsConverting(true)
    try {
      const res = await fetch("/api/zoho-convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceType: type,
          sourceId: zohoId,
          targetType
        })
      })
      if (!res.ok) {
        alert(`Server error (${res.status}) converting document.`)
        return
      }
      const data = await res.json()
      if (data.success) {
        alert(`Successfully converted to ${targetType}!`)
        onClose()
      } else {
        alert(`Failed to convert: ${data.message || data.error}`)
      }
    } catch (e: any) {
      alert(`Error converting document: ${e.message}`)
    } finally {
      setIsConverting(false)
    }
  }, [zohoId, type, onClose])

  const handleSaveLineItems = useCallback(async () => {
    setIsSavingLineItems(true)
    try {
      const res = await fetch("/api/zoho-update-line-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zohoId: zohoId,
          type: type,
          lineItems: editableLineItems
        })
      })
      if (!res.ok) {
        alert(`Server error (${res.status}) saving line items.`)
        return
      }
      const data = await res.json()
      if (data.success) {
        setIsEditingLineItems(false)
        fetchDetails(true) // Refresh list
      } else {
        alert("Failed to save line items: " + (data.error || "Unknown error"))
      }
    } catch (e: any) {
      alert("Error saving line items: " + e.message)
    } finally {
      setIsSavingLineItems(false)
    }
  }, [zohoId, type, editableLineItems, fetchDetails])
  const handleApplyDiscount = useCallback(async () => {
    if (!confirm(`Are you sure you want to apply a ${discountPercentage}% early payment discount?`)) return
    setIsConverting(true)
    try {
      const res = await fetch("/api/zoho-apply-discount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId: zohoId,
          remove: false,
          discountPercentage
        })
      })
      if (!res.ok) {
        alert(`Server error (${res.status}) applying discount.`)
        return
      }
      const data = await res.json()
      if (data.success) {
        alert("Discount applied successfully!")
        onClose()
      } else {
        alert(`Failed to apply discount: ${data.message || data.error}`)
      }
    } catch (e: any) {
      alert(`Error applying discount: ${e.message}`)
    } finally {
      setIsConverting(false)
    }
  }, [zohoId, discountPercentage, onClose])

  // ------ New Action Handlers ------

  const handleSendEmail = useCallback(async () => {
    const docLabel = currentType === 'Quote' ? 'quote' : currentType === 'SalesOrder' ? 'sales order' : 'invoice'
    if (!confirm(`Send this ${docLabel} via email to the customer?`)) return
    setActionLoading("email")
    try {
      const endpoint = type === 'Invoice' ? '/api/zoho-email-invoice' : '/api/zoho-send-document'
      const bodyPayload = type === 'Invoice'
        ? { invoiceId: zohoId }
        : { documentId: zohoId, type }
      
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload)
      })
      if (!res.ok) {
        alert(`Server error (${res.status}) sending document email.`)
        return
      }
      const data = await res.json()
      if (data.success) {
        alert(`✅ ${type === 'Quote' ? 'Quote' : type === 'SalesOrder' ? 'Sales Order' : 'Invoice'} sent to customer!`)
      } else {
        alert(`Failed to send: ${data.error || data.message}`)
      }
    } catch (e: any) {
      alert(`Error: ${e.message}`)
    } finally {
      setActionLoading("")
    }
  }, [zohoId, type, currentType])

  const handleVoid = useCallback(async () => {
    const docLabel = type === 'Quote' ? 'quote' : type === 'SalesOrder' ? 'sales order' : 'invoice'
    if (!confirm(`⚠ï¸  Are you sure you want to VOID this ${docLabel}? This action cannot be easily undone.`)) return
    setActionLoading("void")
    try {
      const res = await fetch("/api/zoho-void", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: zohoId, type })
      })
      const data = await res.json()
      if (data.success) {
        alert(`✅ ${type} voided successfully.`)
        onClose()
      } else {
        alert(`Failed to void: ${data.error || data.message}`)
      }
    } catch (e: any) {
      alert(`Error: ${e.message}`)
    } finally {
      setActionLoading("")
    }
  }, [zohoId, type, onClose])

  const handleUpdateStatus = useCallback(async (action: string) => {
    const labels: Record<string, string> = {
      confirm: 'Confirm this sales order?',
      accepted: 'Mark this quote as accepted?',
      declined: 'Mark this quote as declined?',
    }
    if (!confirm(labels[action] || `Update status to ${action}?`)) return
    setActionLoading(action)
    try {
      const res = await fetch("/api/zoho-update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: zohoId, type, action })
      })
      const data = await res.json()
      if (data.success) {
        alert(`✅ Status updated!`)
        onClose()
      } else {
        alert(`Failed: ${data.error || data.message}`)
      }
    } catch (e: any) {
      alert(`Error: ${e.message}`)
    } finally {
      setActionLoading("")
    }
  }, [zohoId, type, onClose])

  const handleProcessCosts = useCallback(async (silent = false) => {
    const docLabel = type === 'Quote' ? 'quote/estimate' : type === 'SalesOrder' ? 'sales order' : 'invoice'
    if (!silent && !confirm(`Calculate and write all costs, profit, and commission fields for this ${docLabel}?`)) return
    setActionLoading("process-costs")
    setCostResult(null)
    try {
      let endpoint = '/api/process-invoice-costs'
      let bodyPayload: Record<string, any> = {}

      if (type === 'SalesOrder') {
        endpoint = '/api/process-salesorder-costs'
        const soNumber = displayData?.salesorder_number || displayData?.items?.salesOrderNumber
        bodyPayload = soNumber ? { salesorderNumber: soNumber } : { salesorderId: zohoId }
      } else if (type === 'Quote') {
        endpoint = '/api/process-quote-costs'
        const estNumber = displayData?.estimate_number || displayData?.items?.estimateNumber
        bodyPayload = estNumber ? { estimateNumber: estNumber } : { estimateId: zohoId }
      } else {
        const invoiceNumber = displayData?.invoice_number || displayData?.items?.invoiceNumber || displayData?.invoiceNumber
        bodyPayload = invoiceNumber ? { invoiceNumber } : { invoiceId: zohoId }
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload)
      })
      const data = await res.json()
      if (data.success) {
        // Store result to show inline; key varies by doc type
        const result = data.invoice || data.salesorder || data.estimate || data
        setCostResult(result)
      } else if (!silent) {
        alert(`Failed: ${data.error}`)
      }
    } catch (e: any) {
      if (!silent) alert(`Error: ${e.message}`)
    } finally {
      setActionLoading("")
    }
  }, [type, displayData, zohoId])

  const typeColor = currentType === 'Quote' ? 'text-purple-400' : currentType === 'SalesOrder' ? 'text-blue-400' : 'text-amber-500'
  const typeLabel = currentType === 'Quote' ? 'Quote/Estimate' : currentType === 'SalesOrder' ? 'Sales Order' : 'Invoice'
  const statusLower = (displayData?.status || '').toLowerCase()
  const isVoided = statusLower === 'void' || statusLower === 'voided'
  const isPaid = statusLower === 'paid'
  const balanceDue = parseFloat(displayData?.balance || 0)

  return {
    internalInvoiceOverride,
    setInternalInvoiceOverride,
    internalTypeOverride,
    setInternalTypeOverride,
    fullInvoiceDetails,
    setFullInvoiceDetails,
    isLoading,
    setIsLoading,
    dataSource,
    setDataSource,
    cachedAt,
    setCachedAt,
    isConverting,
    setIsConverting,
    actionLoading,
    setActionLoading,
    costResult,
    setCostResult,
    showPackageModal,
    setShowPackageModal,
    showDropshipmentModal,
    setShowDropshipmentModal,
    showPaymentModal,
    setShowPaymentModal,
    activeTab,
    setActiveTab,
    discountPercentage,
    setDiscountPercentage,
    usersList,
    setUsersList,
    isLoadingUsers,
    setIsLoadingUsers,
    isEditingLineItems,
    setIsEditingLineItems,
    editableLineItems,
    setEditableLineItems,
    isSavingLineItems,
    setIsSavingLineItems,
    productsCatalog,
    setProductsCatalog,
    selectedProductId,
    setSelectedProductId,
    newProductQty,
    setNewProductQty,
    newProductPrice,
    setNewProductPrice,
    productSearch,
    setProductSearch,
    showProductDropdown,
    setShowProductDropdown,
    filteredProducts,
    getVigAndGiftStatus,
    currentInvoice,
    currentType,
    isString,
    zohoId,
    initialData,
    fetchDetails,
    hasList,
    handleKeyDown,
    displayData,
    effectiveRole,
    effectiveEmail,
    effectiveName,
    normalizedRole,
    isAdmin,
    isSalesOrderInvoiced,
    spName,
    matchedRep,
    isSalespersonOwner,
    canEdit,
    handleConvert,
    handleSaveLineItems,
    handleApplyDiscount,
    handleSendEmail,
    handleVoid,
    handleUpdateStatus,
    handleProcessCosts,
    typeColor,
    typeLabel,
    statusLower,
    isVoided,
    isPaid,
    balanceDue,
    user,
    session,
    preferences,
  }
}
