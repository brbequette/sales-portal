import { AdminWorkspaceHub } from "@/components/AdminWorkspaceHub"
import { FiCalendar, FiClock, FiMapPin, FiUsers } from "react-icons/fi"

const items = [
  { title: "Users & Permissions", description: "Manage employee identity, roles, visibility and access.", href: "/admin/users", icon: FiUsers },
  { title: "Timeclock", description: "Review shifts, adjustments, idle periods and change requests.", href: "/admin/timeclock", icon: FiClock, accent: "text-cyan-400" },
  { title: "Geofences", description: "Manage approved clock-in locations and boundaries inside Timeclock.", href: "/admin/timeclock?tab=geofences", icon: FiMapPin, accent: "text-orange-400" },
  { title: "Holidays", description: "Configure company holidays used by scheduling and payroll.", href: "/admin/holidays", icon: FiCalendar, accent: "text-violet-400" },
]

export default function PeopleTimePage() {
  return <AdminWorkspaceHub eyebrow="Workspace" title="People & Time" description="Administer employee access, attendance rules and working-time exceptions." items={items} />
}
