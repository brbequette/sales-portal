import { AdminWorkspaceHub } from "@/components/AdminWorkspaceHub"
import { FiActivity, FiImage, FiRepeat, FiSettings, FiTruck } from "react-icons/fi"

const items = [
  { title: "Shipping Audit", description: "Review fulfillment, vendor shipping and exceptions.", href: "/admin/shipping-audit", icon: FiTruck },
  { title: "Vendors", description: "Maintain vendor records used across operations.", href: "/admin/vendors", icon: FiActivity, accent: "text-cyan-400" },
  { title: "Image Manager", description: "Manage shared product and system imagery.", href: "/admin/image-manager", icon: FiImage, accent: "text-violet-400" },
  { title: "Autoship", description: "Maintain recurring fulfillment bundles.", href: "/admin/autoship", icon: FiRepeat, accent: "text-amber-400" },
  { title: "System Settings", description: "Configure financial, communication, shipping and system policies.", href: "/admin/settings", icon: FiSettings, accent: "text-blue-400" },
]

export default function OperationsCenterPage() {
  return <AdminWorkspaceHub eyebrow="Workspace" title="Operations" description="Administer fulfillment resources and cross-system operating policies." items={items} />
}
