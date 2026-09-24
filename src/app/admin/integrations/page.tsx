"use client"

import { AdminWorkspaceHub } from "@/components/AdminWorkspaceHub"
import { FiCloud, FiInbox, FiMessageSquare, FiRefreshCw, FiSettings, FiTruck } from "react-icons/fi"

const items = [
  { title: "Integration Status & Policy", description: "Review connection state and configure bounded synchronization behavior.", href: "/admin/settings?tab=sync", icon: FiCloud },
  { title: "Zoho Books Maintenance", description: "Targeted Books synchronization and financial processing tools.", href: "/admin/books-scripts", icon: FiRefreshCw, badge: "Advanced", warning: "Contains production data-changing operations and explicit confirmation gates." },
  { title: "Zoho Voice & Communications", description: "Review configured numbers, call reconciliation and Voice synchronization.", href: "/admin/communications", icon: FiMessageSquare, accent: "text-pink-400" },
  { title: "Email Intelligence", description: "Manage Microsoft 365 mailboxes and extracted operational events.", href: "/admin/email-intelligence", icon: FiInbox, accent: "text-violet-400" },
  { title: "Shipping", description: "Audit fulfillment and vendor shipping integration exceptions.", href: "/admin/shipping-audit", icon: FiTruck, accent: "text-orange-400" },
  { title: "Global Integration Defaults", description: "Manage provider-independent settings and application defaults.", href: "/admin/settings", icon: FiSettings, accent: "text-blue-400" },
]

export default function IntegrationsPage() {
  return <AdminWorkspaceHub eyebrow="Connected systems" title="Integrations" description="Connection state, policies and exception handling for Zoho, email, shipping and other providers." items={items} />
}
