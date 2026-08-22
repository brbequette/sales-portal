import { AdminWorkspaceHub } from "@/components/AdminWorkspaceHub"
import { FiActivity, FiImage, FiMessageSquare, FiSend } from "react-icons/fi"

const items = [
  { title: "Campaigns", description: "Build, schedule and monitor outbound campaigns.", href: "/admin/campaigns", icon: FiSend },
  { title: "Flyer Studio", description: "Pair contractor products with Titan blades and create campaign-ready creative.", href: "/admin/flyer-studio", icon: FiImage, accent: "text-orange-400" },
  { title: "Communication Log", description: "Review communication history and delivery activity.", href: "/admin/communications", icon: FiActivity, accent: "text-cyan-400" },
  { title: "Notification Templates", description: "Maintain reusable system email and message templates.", href: "/admin/notification-templates", icon: FiMessageSquare, accent: "text-violet-400" },
]

export default function CommunicationsCenterPage() {
  return <AdminWorkspaceHub eyebrow="Workspace" title="Communications" description="Manage outbound messaging, reusable content and delivery history." items={items} />
}
