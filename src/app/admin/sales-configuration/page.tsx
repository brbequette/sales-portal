import { AdminWorkspaceHub } from "@/components/AdminWorkspaceHub"
import { FiAlertTriangle, FiFileText, FiGift, FiSettings, FiTarget, FiTrendingUp, FiZap } from "react-icons/fi"

const items = [
  { title: "Sales Stages", description: "Configure pipeline stages and stage-driven workflows.", href: "/admin/sales-stages", icon: FiTrendingUp },
  { title: "Call Scripts", description: "Maintain approved scripts used by representatives and AI assistance.", href: "/admin/scripts", icon: FiFileText, accent: "text-cyan-400" },
  { title: "Intro Offer", description: "Configure introductory product offers and landing content.", href: "/admin/intro-offer", icon: FiZap, accent: "text-amber-400" },
  { title: "Product Volume & Gifts", description: "Assign volume tiers, package prices and qualifying giveaway SKUs to any product.", href: "/admin/product-offers", icon: FiGift, accent: "text-orange-400" },
  { title: "Account Assignment", description: "Bulk-reassign accounts and maintain ownership.", href: "/admin/update-accounts", icon: FiTarget, accent: "text-blue-400" },
  { title: "Account Quality", description: "Resolve lead and ownership discrepancies.", href: "/admin/lead-discrepancies", icon: FiAlertTriangle, accent: "text-orange-400" },
  { title: "Portal & Activity Rules", description: "Configure inactivity windows, role visibility, update groups and sales targets.", href: "/admin/update-config", icon: FiSettings, accent: "text-violet-400" },
]

export default function SalesConfigurationPage() {
  return <AdminWorkspaceHub eyebrow="Workspace" title="Sales Configuration" description="Configure how accounts, pipeline stages, offers and sales tools behave." items={items} />
}
