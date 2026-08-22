import { AdminWorkspaceHub } from "@/components/AdminWorkspaceHub"
import { FiAward, FiBarChart2, FiCreditCard, FiDollarSign, FiSliders, FiTarget } from "react-icons/fi"

const items = [
  { title: "VIG Management", description: "Configure VIG rates, history and financial treatment.", href: "/admin/vig", icon: FiSliders },
  { title: "Compensation Plans", description: "Define commission rules and representative plans.", href: "/admin/compensation", icon: FiTarget, accent: "text-cyan-400" },
  { title: "Payouts", description: "Review and manage commission payout records.", href: "/admin/payouts", icon: FiDollarSign, accent: "text-violet-400" },
  { title: "Payroll", description: "Manage advances, reimbursements and payroll preparation.", href: "/admin/payroll", icon: FiCreditCard, accent: "text-blue-400" },
  { title: "Goals & Bonuses", description: "Configure sales goals, contests and bonus programs.", href: "/admin/goals-bonuses", icon: FiAward, accent: "text-amber-400" },
  { title: "Representative Stats", description: "Review performance and compensation-related metrics.", href: "/admin/rep-stats", icon: FiBarChart2, accent: "text-emerald-400" },
]

export default function CompensationCenterPage() {
  return <AdminWorkspaceHub eyebrow="Workspace" title="Compensation & Payroll" description="Manage the complete path from performance rules through approved payment." items={items} />
}
