"use client"

import { AdminWorkspaceHub } from "@/components/AdminWorkspaceHub"
import { FiActivity, FiAlertTriangle, FiDatabase, FiInbox, FiMessageSquare, FiTool } from "react-icons/fi"

const items = [
  { title: "Operational Work Queue", description: "Prioritized handoffs, provider failures, unmatched records and due reviews.", href: "/admin/operations-workbench", icon: FiActivity },
  { title: "Sync Conflicts", description: "Review records changed in both systems and approve the authoritative version.", href: "/admin/sync-conflicts", icon: FiAlertTriangle, accent: "text-amber-400" },
  { title: "Data Integrity", description: "Inspect orphaned or incomplete records and evidence-backed repair candidates.", href: "/admin/orphaned-records", icon: FiDatabase, accent: "text-red-400" },
  { title: "Campaign Delivery", description: "Monitor durable campaign workers, reconciliation and interrupted sends.", href: "/admin/campaigns", icon: FiMessageSquare, accent: "text-pink-400" },
  { title: "Email Processing", description: "Review mailbox synchronization and extracted-event status.", href: "/admin/email-intelligence", icon: FiInbox, accent: "text-violet-400" },
  { title: "Reconciliation Artifacts", description: "Register signed reconciliation evidence for review; Apply remains separately controlled.", href: "/admin/reconciliation-artifact-registry", icon: FiTool, badge: "Restricted" },
]

export default function SystemHealthPage() {
  return <AdminWorkspaceHub eyebrow="Monitoring & exceptions" title="System Health" description="Observe queues, failures and integrity warnings separately from routine configuration." items={items} />
}
