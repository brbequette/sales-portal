"use client"

import { AdminWorkspaceHub } from "@/components/AdminWorkspaceHub"
import { FiDatabase, FiDownloadCloud, FiFileText, FiGitMerge, FiTool, FiUploadCloud } from "react-icons/fi"

const warning = "Administrator-only maintenance. Read the page-specific warning and confirmation before changing production data."
const items = [
  { title: "Zoho Books Maintenance", description: "Full sync, cost processing, payment backfill and targeted Books repair controls.", href: "/admin/books-scripts", icon: FiTool, badge: "Dangerous", warning },
  { title: "Bounded Books Import", description: "Date-bounded import workflow with explicit scope and status.", href: "/admin/bounded-books-import", icon: FiDownloadCloud, badge: "Import", warning },
  { title: "Invoice Export Import", description: "Portal-only invoice reconciliation and controlled artifact intake.", href: "/admin/invoice-export-import", icon: FiUploadCloud, badge: "Repair", warning },
  { title: "Reconciliation Artifact Registry", description: "Register review artifacts without enabling approval or Apply.", href: "/admin/reconciliation-artifact-registry", icon: FiFileText, badge: "Restricted", warning },
  { title: "Ross Commission Reconciliation", description: "Narrow historical portal commission audit and explicitly confirmed correction.", href: "/admin/ross-commission-reconciliation", icon: FiDatabase, badge: "One-time", warning },
  { title: "Benjamin Identity Merge", description: "Special-purpose identity maintenance retained for auditability.", href: "/admin/maintenance/ben-merge", icon: FiGitMerge, badge: "One-time", warning },
]

export default function AdvancedPage() {
  return <AdminWorkspaceHub eyebrow="Restricted administration" title="Advanced / Developer Tools" description="One-time imports, backfills and repair utilities are intentionally separated from everyday administration." items={items} />
}
