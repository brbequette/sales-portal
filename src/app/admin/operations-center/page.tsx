"use client"

import { AdminWorkspaceHub } from "@/components/AdminWorkspaceHub"
import { FiActivity, FiAlertTriangle, FiTruck } from "react-icons/fi"

const items = [
  { title: "Operational Work Queue", description: "Prioritized handoffs, Zoho failures, unmatched records, review work and deadlines.", href: "/admin/operations-workbench", icon: FiAlertTriangle, accent: "text-orange-400" },
  { title: "Shipping Audit", description: "Review fulfillment, vendor shipping and exceptions.", href: "/admin/shipping-audit", icon: FiTruck },
  { title: "Vendors", description: "Maintain vendor records used across operations.", href: "/admin/vendors", icon: FiActivity, accent: "text-cyan-400" },
]

export default function OperationsCenterPage() {
  return <AdminWorkspaceHub eyebrow="Workspace" title="Operations" description="Administer fulfillment resources and cross-system operating policies." items={items} />
}
