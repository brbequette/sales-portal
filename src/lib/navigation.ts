import type { ElementType } from 'react'
import { FiHome, FiCheckSquare, FiTrendingUp, FiPackage, FiHeadphones, FiMessageSquare, FiMail, FiLayers, FiTruck, FiFileText, FiCreditCard, FiBarChart2, FiDollarSign, FiAward, FiTool, FiBookOpen, FiClock } from 'react-icons/fi'

export type NavItem = { href: string; label: string; mobileLabel?: string; icon: ElementType; color: string }
export const navigationGroups: Array<{ label: string; items: NavItem[] }> = [
  { label: 'Sales & daily work', items: [
    { href: '/dashboard', label: 'Dashboard', mobileLabel: 'Home', icon: FiHome, color: 'text-sky-400' },
    { href: '/tasks', label: 'Tasks & follow-ups', mobileLabel: 'Tasks', icon: FiCheckSquare, color: 'text-violet-400' },
    { href: '/sales', label: 'Accounts & pipeline', mobileLabel: 'Sales', icon: FiTrendingUp, color: 'text-emerald-400' },
    { href: '/catalog', label: 'Product catalog', icon: FiPackage, color: 'text-amber-400' },
  ] },
  { label: 'Communications', items: [
    { href: '/communications', label: 'Communications workspace', icon: FiHeadphones, color: 'text-cyan-400' },
    { href: '/messages', label: 'Text conversations', mobileLabel: 'Texts', icon: FiMessageSquare, color: 'text-teal-400' },
    { href: '/messages/email', label: 'Email inbox', icon: FiMail, color: 'text-blue-400' },
  ] },
  { label: 'Orders & fulfillment', items: [
    { href: '/processing', label: 'Order processing', mobileLabel: 'Orders', icon: FiLayers, color: 'text-orange-400' },
    { href: '/shipping', label: 'Shipping & tracking', icon: FiTruck, color: 'text-amber-400' },
    { href: '/docs', label: 'Sales documents', icon: FiFileText, color: 'text-sky-400' },
  ] },
  { label: 'Collections & earnings', items: [
    { href: '/collections', label: 'Collections & aging', icon: FiCreditCard, color: 'text-rose-400' },
    { href: '/collections/stats', label: 'Collections performance', icon: FiBarChart2, color: 'text-pink-400' },
    { href: '/commissions', label: 'Commissions & earnings', icon: FiDollarSign, color: 'text-green-400' },
    { href: '/stats', label: 'Sales performance', icon: FiAward, color: 'text-yellow-400' },
  ] },
  { label: 'Resources', items: [
    { href: '/tools', label: 'Tools & media', icon: FiTool, color: 'text-indigo-400' },
    { href: '/training', label: 'Training', icon: FiBookOpen, color: 'text-teal-400' },
    { href: '/timeclock', label: 'Timeclock', icon: FiClock, color: 'text-lime-400' },
  ] },
]
// Longest paths first: email and collections reports must not count as their parent routes.
export const navigationItems = navigationGroups.flatMap(group => group.items).sort((a, b) => b.href.length - a.href.length)
export const groupAccent: Record<string, string> = {
  'Sales & daily work': 'bg-sky-500', Communications: 'bg-cyan-500',
  'Orders & fulfillment': 'bg-orange-500', 'Collections & earnings': 'bg-rose-500', Resources: 'bg-indigo-500',
}
