"use client"

import { AdminWorkspaceHub } from "@/components/AdminWorkspaceHub"
import { FiCalendar, FiClock, FiEdit3, FiMapPin, FiSettings, FiUsers } from "react-icons/fi"

const items = [
  { title: "Users & Permissions", description: "Manage employee identity, roles, visibility and administrative access.", href: "/admin/users", icon: FiUsers },
  { title: "Company Defaults", description: "Configure global financial, communication, shipping and application defaults.", href: "/admin/settings", icon: FiSettings, accent: "text-blue-400" },
  { title: "Custom Fields", description: "Review company-wide local and Zoho field definitions and mappings.", href: "/admin/custom-fields", icon: FiEdit3, accent: "text-cyan-400" },
  { title: "Holidays", description: "Maintain company holidays used by scheduling, goals and payroll.", href: "/admin/holidays", icon: FiCalendar, accent: "text-violet-400" },
  { title: "Timeclock", description: "Review shifts, adjustments, idle periods and change requests.", href: "/admin/timeclock", icon: FiClock, accent: "text-emerald-400" },
  { title: "Geofences", description: "Manage approved clock-in locations inside the Timeclock workspace.", href: "/admin/timeclock?tab=geofences", icon: FiMapPin, accent: "text-orange-400" },
]

export default function CompanySettingsPage() {
  return <AdminWorkspaceHub eyebrow="Business administration" title="Company Settings" description="People, permissions and global policies that define how Titan operates." items={items} />
}
