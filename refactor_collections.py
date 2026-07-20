import re
import os

file_path = r"src\app\collections\page.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Update imports
content = content.replace(
    'import { useProductModal } from "@/components/ProductModalProvider"\nimport { InvoiceDetailsModal } from "@/components/InvoiceDetailsModal"',
    'import { InvoiceDetailsModal } from "@/components/InvoiceDetailsModal"\nimport { CollectionsModal, Invoice } from "@/components/CollectionsModal"'
)

# 2. Remove Types (Invoice, CallOutcome, OUTCOME_LABELS, OUTCOME_COLORS)
# But keep fmt, agingBucket, getProductImage
# Let's find the start of Types
start_types = content.find("// ── Types ──────────────────────────────────────────────────────────────")
# Find the start of fmt
start_fmt = content.find("function fmt(n: number) {")
if start_types != -1 and start_fmt != -1:
    content = content[:start_types] + content[start_fmt:]

# 3. Remove Modals (CallModal, RunCardModal, RequestReturnModal, CallCampaignModal)
# Let's find the start of CallModal
start_modals = content.find("// ── Log Call Modal ─────────────────────────────────────────────────────")
# Let's find the start of CollectionsPage
start_page = content.find("// ── Main Collections Page ──────────────────────────────────────────────")
if start_modals != -1 and start_page != -1:
    content = content[:start_modals] + content[start_page:]

# 4. Replace the Modals inside CollectionsPage return statement
modals_str_start = content.find("{/* Modals */}")
modals_str_end = content.find("{viewingInvoiceZohoId && (")
if modals_str_start != -1 and modals_str_end != -1:
    replacement = """{/* Modals */}
      <CollectionsModal 
        isOpen={!!callModal || !!showRunCardDirect || showCallCampaign}
        mode={callModal ? 'call' : showRunCardDirect ? 'card' : showCallCampaign ? 'campaign' : null}
        invoice={callModal || showRunCardDirect}
        campaignInvoices={filtered}
        onClose={() => {
          setCallModal(null)
          setShowRunCardDirect(null)
          setShowCallCampaign(false)
        }}
        onSuccess={() => {
          fetchInvoices()
        }}
      />

      """
    content = content[:modals_str_start] + replacement + content[modals_str_end:]

# 5. Remove CallCampaignModal rendering
call_campaign_start = content.find("{showCallCampaign && (")
call_campaign_end = content.find("</div>\n  )\n}", call_campaign_start)
if call_campaign_start != -1 and call_campaign_end != -1:
    content = content[:call_campaign_start] + content[call_campaign_end:]

with open(file_path, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print("Done")
