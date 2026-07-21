"use client"


import { useState, useEffect, useCallback } from "react"
import { createPortal } from "react-dom"
import { FiFileText, FiDatabase, FiRefreshCw, FiBox, FiTruck, FiDownload, FiMail, FiDollarSign, FiXCircle, FiCheckCircle, FiSlash, FiSend, FiCheck, FiCpu, FiChevronLeft, FiChevronRight } from "react-icons/fi"
import { CreatePackageModal } from "./CreatePackageModal"
import { CreateDropshipmentModal } from "./CreateDropshipmentModal"
import { RecordPaymentModal } from "./RecordPaymentModal"
import { DocumentLifecycle } from "./DocumentLifecycle"
import { SaleCommunications } from "./SaleCommunications"

interface InvoiceDetailsModalProps {
  invoice: any | string; // Can be an invoice object or just the zohoId string
  type?: "Quote" | "SalesOrder" | "Invoice";
  onClose: () => void;
  // Optional navigation — pass the full list and current index to enable prev/next
  invoiceList?: any[];
  currentIndex?: number;
  onNavigate?: (index: number) => void;
}

export function InvoiceDetailsModal({ invoice, type: initialType = "Invoice", onClose, invoiceList, currentIndex, onNavigate }: InvoiceDetailsModalProps) {
  const [overrideDoc, setOverrideDoc] = useState<{ id: string, type: 'Quote' | 'SalesOrder' | 'Invoice' } | null>(null)
  const type = overrideDoc ? overrideDoc.type : initialType;
  const [fullInvoiceDetails, setFullInvoiceDetails] = useState<any | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [dataSource, setDataSource] = useState<'zoho_live' | 'local_db' | null>(null)
  const [cachedAt, setCachedAt] = useState<string | null>(null)
  const [isConverting, setIsConverting] = useState(false)
  const [actionLoading, setActionLoading] = useState("")
  // Cost processing result stored inline (replaces alert)
  const [costResult, setCostResult] = useState<any | null>(null)
            <SaleCommunications zohoId={zohoId} />
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

