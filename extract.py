import re

with open('src/components/InvoiceDetailsModal.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the start of the component
match_start = re.search(r'export function InvoiceDetailsModal\([^)]+\) \{', content)
start_idx = match_start.end()
match_end = re.search(r'\n  return createPortal\(', content)
end_idx = match_end.start()

logic = content[start_idx:end_idx]

# Write useInvoiceDetailsData.ts
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

# Process logic to wrap in useCallback using DOTALL

def wrap_func(name, end_string, deps):
    global logic
    pattern = rf'(const {name} = (?P<async>async )?\([^)]*\) => {{.*?){re.escape(end_string)}'
    replacement = rf'const {name} = useCallback(\g<async>(...) => {{...}})' # Wait, we need to match the arguments too!
    # Let's do it safer:
    # 1. find the function definition
    pattern = rf'(const {name} = (?:async )?\([^)]*\) => {{.*?){re.escape(end_string)}'
    
    match = re.search(pattern, logic, re.DOTALL)
    if match:
        original = match.group(0)
        # replace the 'const name = ' with 'const name = useCallback('
        new_text = original.replace(f'const {name} = ', f'const {name} = useCallback(')
        # replace the end string with the end string + deps
        new_text = new_text[:-len(end_string)] + end_string.replace('}\n  }', f'}}\n  }}, {deps})')
        logic = logic.replace(original, new_text)

# Let's just use simple re.sub with limit 1
logic = re.sub(r'const getVigAndGiftStatus = \(item: any\) => \{', r'const getVigAndGiftStatus = useCallback((item: any) => {', logic, count=1)
logic = re.sub(r'    return \{ isExempt: isItemExemptFromVig\(item\), isGift: false \}\n  \}', r'    return { isExempt: isItemExemptFromVig(item), isGift: false }\n  }, [fullInvoiceDetails, productsCatalog])', logic, count=1)

logic = re.sub(r'const fetchDetails = async \(force = false\) => \{', r'const fetchDetails = useCallback(async (force = false) => {', logic, count=1)
logic = re.sub(r'      console\.error\("Failed to load full document details", e\)\n    \} finally \{\n      setIsLoading\(false\)\n    \}\n  \}', r'      console.error("Failed to load full document details", e)\n    } finally {\n      setIsLoading(false)\n    }\n  }, [zohoId, currentType, fullInvoiceDetails, handleProcessCosts])', logic, count=1)

logic = re.sub(r'const handleConvert = async \(targetType: "SalesOrder" \| "Invoice"\) => \{', r'const handleConvert = useCallback(async (targetType: "SalesOrder" | "Invoice") => {', logic, count=1)
logic = re.sub(r'      alert\(`Error converting document: \$\{e\.message\}`\)\n    \} finally \{\n      setIsConverting\(false\)\n    \}\n  \}', r'      alert(`Error converting document: ${e.message}`)\n    } finally {\n      setIsConverting(false)\n    }\n  }, [zohoId, type, onClose])', logic, count=1)

logic = re.sub(r'const handleSaveLineItems = async \(\) => \{', r'const handleSaveLineItems = useCallback(async () => {', logic, count=1)
logic = re.sub(r'      alert\("Error saving line items: " \+ e\.message\)\n    \} finally \{\n      setIsSavingLineItems\(false\)\n    \}\n  \}', r'      alert("Error saving line items: " + e.message)\n    } finally {\n      setIsSavingLineItems(false)\n    }\n  }, [zohoId, type, editableLineItems, fetchDetails])', logic, count=1)

logic = re.sub(r'const handleApplyDiscount = async \(\) => \{', r'const handleApplyDiscount = useCallback(async () => {', logic, count=1)
logic = re.sub(r'      alert\(`Error applying discount: \$\{e\.message\}`\)\n    \} finally \{\n      setIsConverting\(false\)\n    \}\n  \}', r'      alert(`Error applying discount: ${e.message}`)\n    } finally {\n      setIsConverting(false)\n    }\n  }, [zohoId, discountPercentage, onClose])', logic, count=1)

logic = re.sub(r'const handleSendEmail = async \(\) => \{', r'const handleSendEmail = useCallback(async () => {', logic, count=1)
logic = re.sub(r'      alert\(`Error: \$\{e\.message\}`\)\n    \} finally \{\n      setActionLoading\(""\)\n    \}\n  \}', r'      alert(`Error: ${e.message}`)\n    } finally {\n      setActionLoading("")\n    }\n  }, [zohoId, type, currentType])', logic, count=1)

logic = re.sub(r'const handleVoid = async \(\) => \{', r'const handleVoid = useCallback(async () => {', logic, count=1)
# wait handleVoid ends with alert(`Error: ${e.message}`) and finally setActionLoading("")
# Since handleSendEmail also ends with the same thing, we need to match the specific function.
# Let's use DOTALL to match the specific function body.
def wrap_func_regex(name, logic_str, deps):
    pattern = rf'(const {name} = (?:async )?\([^)]*\) => {{.*?)(?=\n\n|\Z)'
    # wait \n\n is not reliable. Let's match until \n  }
    # But there might be other \n  } inside.
    pass

# A better way is to just write a simple state machine to find the matching '}' for the function.
def wrap_with_usecallback(func_name, deps, text):
    start_str = f"const {func_name} = "
    start_idx = text.find(start_str)
    if start_idx == -1: return text
    
    # Replace 'const name = ' with 'const name = useCallback('
    text = text[:start_idx] + text[start_idx:].replace(start_str, f"const {func_name} = useCallback(", 1)
    
    # Now find the end of this function. We can parse braces.
    # The start of the function is right after useCallback(
    idx = text.find('{', start_idx)
    if idx == -1: return text
    
    brace_count = 1
    idx += 1
    while idx < len(text) and brace_count > 0:
        if text[idx] == '{': brace_count += 1
        elif text[idx] == '}': brace_count -= 1
        idx += 1
        
    # idx is now right after the closing '}'
    text = text[:idx] + f", {deps})" + text[idx:]
    return text

logic = wrap_with_usecallback('getVigAndGiftStatus', '[fullInvoiceDetails, productsCatalog]', logic)
logic = wrap_with_usecallback('fetchDetails', '[zohoId, currentType, fullInvoiceDetails, handleProcessCosts]', logic)
logic = wrap_with_usecallback('handleConvert', '[zohoId, type, onClose]', logic)
logic = wrap_with_usecallback('handleSaveLineItems', '[zohoId, type, editableLineItems, fetchDetails]', logic)
logic = wrap_with_usecallback('handleApplyDiscount', '[zohoId, discountPercentage, onClose]', logic)
logic = wrap_with_usecallback('handleSendEmail', '[zohoId, type, currentType]', logic)
logic = wrap_with_usecallback('handleVoid', '[zohoId, type, onClose]', logic)
logic = wrap_with_usecallback('handleUpdateStatus', '[zohoId, type, onClose]', logic)
logic = wrap_with_usecallback('handleProcessCosts', '[type, displayData, zohoId]', logic)

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
new_component = '''export function InvoiceDetailsModal(props: InvoiceDetailsModalProps) {
  const {
'''
for r in returns:
    new_component += f'    {r},\n'
new_component += '''  } = useInvoiceDetailsData(props)
'''

# We also need to change the imports in InvoiceDetailsModal.tsx
# Replace logic with new_component
new_content = content[:start_idx] + '\n  ' + new_component + content[end_idx:]

# Remove unused imports from InvoiceDetailsModal.tsx
new_content = new_content.replace('import { useState, useEffect, useCallback, useMemo } from "react"\n', '')
new_content = new_content.replace('import { useSession } from "next-auth/react"\n', '')
new_content = new_content.replace('import { useZoho } from "@/components/ZohoProvider"\n', '')
new_content = new_content.replace('import { usePreferences } from "@/components/PreferencesProvider"\n', '')
new_content = new_content.replace('import { isItemExemptFromVig } from "@/lib/custom-field-extractor"\n', '')

# Remove interface declaration
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

# Add hook import
hook_import = '''import { useInvoiceDetailsData, type InvoiceDetailsModalProps } from "./useInvoiceDetailsData"\n'''
new_content = new_content.replace('"use client"\n', '"use client"\n\n' + hook_import)

with open('src/components/InvoiceDetailsModal.tsx', 'w', encoding='utf-8') as f:
    f.write(new_content)

print("Done generating hook and updating component.")
