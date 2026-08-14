import re

with open('logic.ts', 'r', encoding='utf-8') as f:
    logic = f.read()

# getVigAndGiftStatus
logic = re.sub(
    r'(const getVigAndGiftStatus = \(item: any\) => \{.*?return \{ isExempt: isItemExemptFromVig\(item\), isGift: false \}\n  \})',
    lambda m: m.group(1).replace('const getVigAndGiftStatus = (item: any) => {', 'const getVigAndGiftStatus = useCallback((item: any) => {')[:-1] + '}, [fullInvoiceDetails, productsCatalog])',
    logic, flags=re.DOTALL
)

# fetchDetails
logic = re.sub(
    r'(const fetchDetails = async \(force = false\) => \{.*?setIsLoading\(false\)\n    \}\n  \})',
    lambda m: m.group(1).replace('const fetchDetails = async (force = false) => {', 'const fetchDetails = useCallback(async (force = false) => {')[:-1] + '}, [zohoId, currentType, fullInvoiceDetails])',
    logic, flags=re.DOTALL
)

# handleConvert
logic = re.sub(
    r'(const handleConvert = async \(targetType: "SalesOrder" \| "Invoice"\) => \{.*?setIsConverting\(false\)\n    \}\n  \})',
    lambda m: m.group(1).replace('const handleConvert = async (targetType: "SalesOrder" | "Invoice") => {', 'const handleConvert = useCallback(async (targetType: "SalesOrder" | "Invoice") => {')[:-1] + '}, [zohoId, type, onClose])',
    logic, flags=re.DOTALL
)

# handleSaveLineItems
logic = re.sub(
    r'(const handleSaveLineItems = async \(\) => \{.*?setIsSavingLineItems\(false\)\n    \}\n  \})',
    lambda m: m.group(1).replace('const handleSaveLineItems = async () => {', 'const handleSaveLineItems = useCallback(async () => {')[:-1] + '}, [zohoId, type, editableLineItems, fetchDetails])',
    logic, flags=re.DOTALL
)

# handleApplyDiscount
logic = re.sub(
    r'(const handleApplyDiscount = async \(\) => \{.*?setIsConverting\(false\)\n    \}\n  \})',
    lambda m: m.group(1).replace('const handleApplyDiscount = async () => {', 'const handleApplyDiscount = useCallback(async () => {')[:-1] + '}, [zohoId, discountPercentage, onClose])',
    logic, flags=re.DOTALL
)

# handleSendEmail
logic = re.sub(
    r'(const handleSendEmail = async \(\) => \{.*?setActionLoading\(""\)\n    \}\n  \})',
    lambda m: m.group(1).replace('const handleSendEmail = async () => {', 'const handleSendEmail = useCallback(async () => {')[:-1] + '}, [zohoId, type, currentType])',
    logic, flags=re.DOTALL
)

# handleVoid
logic = re.sub(
    r'(const handleVoid = async \(\) => \{.*?setActionLoading\(""\)\n    \}\n  \})',
    lambda m: m.group(1).replace('const handleVoid = async () => {', 'const handleVoid = useCallback(async () => {')[:-1] + '}, [zohoId, type, onClose])',
    logic, flags=re.DOTALL
)

# handleUpdateStatus
logic = re.sub(
    r'(const handleUpdateStatus = async \(action: string\) => \{.*?setActionLoading\(""\)\n    \}\n  \})',
    lambda m: m.group(1).replace('const handleUpdateStatus = async (action: string) => {', 'const handleUpdateStatus = useCallback(async (action: string) => {')[:-1] + '}, [zohoId, type, onClose])',
    logic, flags=re.DOTALL
)

# handleProcessCosts
logic = re.sub(
    r'(const handleProcessCosts = async \(silent = false\) => \{.*?setActionLoading\(""\)\n    \}\n  \})',
    lambda m: m.group(1).replace('const handleProcessCosts = async (silent = false) => {', 'const handleProcessCosts = useCallback(async (silent = false) => {')[:-1] + '}, [type, displayData, zohoId])',
    logic, flags=re.DOTALL
)


hook_content = '''"use client"

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
'''

hook_content += logic

returns = [
    'internalInvoiceOverride', 'setInternalInvoiceOverride',
    'internalTypeOverride', 'setInternalTypeOverride',
    'fullInvoiceDetails', 'setFullInvoiceDetails',
    'isLoading', 'setIsLoading',
    'dataSource', 'setDataSource',
    'cachedAt', 'setCachedAt',
    'isConverting', 'setIsConverting',
    'actionLoading', 'setActionLoading',
    'costResult', 'setCostResult',
    'showPackageModal', 'setShowPackageModal',
    'showDropshipmentModal', 'setShowDropshipmentModal',
    'showPaymentModal', 'setShowPaymentModal',
    'activeTab', 'setActiveTab',
    'discountPercentage', 'setDiscountPercentage',
    'usersList', 'setUsersList',
    'isLoadingUsers', 'setIsLoadingUsers',
    'isEditingLineItems', 'setIsEditingLineItems',
    'editableLineItems', 'setEditableLineItems',
    'isSavingLineItems', 'setIsSavingLineItems',
    'productsCatalog', 'setProductsCatalog',
    'selectedProductId', 'setSelectedProductId',
    'newProductQty', 'setNewProductQty',
    'newProductPrice', 'setNewProductPrice',
    'productSearch', 'setProductSearch',
    'showProductDropdown', 'setShowProductDropdown',
    'filteredProducts',
    'getVigAndGiftStatus',
    'currentInvoice', 'currentType', 'isString', 'zohoId', 'initialData', 'fetchDetails',
    'hasList', 'handleKeyDown',
    'displayData',
    'effectiveRole', 'effectiveEmail', 'effectiveName',
    'normalizedRole', 'isAdmin', 'isSalesOrderInvoiced',
    'spName', 'matchedRep', 'isSalespersonOwner', 'canEdit',
    'handleConvert', 'handleSaveLineItems', 'handleApplyDiscount',
    'handleSendEmail', 'handleVoid', 'handleUpdateStatus', 'handleProcessCosts',
    'typeColor', 'typeLabel', 'statusLower', 'isVoided', 'isPaid', 'balanceDue',
    'user', 'session', 'preferences'
]

hook_content += '''
  return {
'''
for r in returns:
    hook_content += f'    {r},\n'
hook_content += '''  }
}
'''

with open('src/components/useInvoiceDetailsData.ts', 'w', encoding='utf-8') as f:
    f.write(hook_content)


# Now modify InvoiceDetailsModal.tsx
with open('src/components/InvoiceDetailsModal.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

match_start = re.search(r'export function InvoiceDetailsModal\([^)]+\) \{', content)
start_idx = match_start.end()
match_end = re.search(r'\n  return createPortal\(', content)
end_idx = match_end.start()

new_component = '''\n  const {
'''
for r in returns:
    new_component += f'    {r},\n'
new_component += '''  } = useInvoiceDetailsData({ invoice, type, onClose, invoiceList, currentIndex, onNavigate })
'''

new_content = content[:start_idx] + new_component + content[end_idx:]

# Remove unused imports from InvoiceDetailsModal.tsx
new_content = new_content.replace('import { useState, useEffect, useCallback, useMemo } from "react"\n', '')
new_content = new_content.replace('import { useSession } from "next-auth/react"\n', '')
new_content = new_content.replace('import { useZoho } from "@/components/ZohoProvider"\n', '')
new_content = new_content.replace('import { usePreferences } from "@/components/PreferencesProvider"\n', '')
new_content = new_content.replace('import { isItemExemptFromVig } from "@/lib/custom-field-extractor"\n', '')

interface_str = '''interface InvoiceDetailsModalProps {
  invoice: any | string; // Can be an invoice object or just the zohoId string
  type?: "Quote" | "SalesOrder" | "Invoice";
  onClose: () => void;
  // Optional navigation -- pass the full list and current index to enable prev/next
  invoiceList?: any[];
  currentIndex?: number;
  onNavigate?: (index: number) => void;
}

'''
new_content = new_content.replace(interface_str, '')

hook_import = '''import { useInvoiceDetailsData, type InvoiceDetailsModalProps } from "./useInvoiceDetailsData"\n'''
new_content = new_content.replace('"use client"\n', '"use client"\n\n' + hook_import)

with open('src/components/InvoiceDetailsModal.tsx', 'w', encoding='utf-8') as f:
    f.write(new_content)

print("Done")
