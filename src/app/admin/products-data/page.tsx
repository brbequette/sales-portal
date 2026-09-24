"use client"

import { AdminWorkspaceHub } from "@/components/AdminWorkspaceHub"
import { FiDatabase, FiDownload, FiGift, FiImage, FiPackage, FiRepeat } from "react-icons/fi"

const items = [
  { title: "Catalog Import", description: "Validate and import approved product catalog CSV data.", href: "/admin/catalog-import", icon: FiDownload, warning: "Changes product records. Review the import summary before applying." },
  { title: "Product Volume & Gifts", description: "Configure package pricing, volume tiers and qualifying giveaway SKUs.", href: "/admin/product-offers", icon: FiGift, accent: "text-orange-400" },
  { title: "Image Manager", description: "Maintain shared product artwork and catalog imagery.", href: "/admin/image-manager", icon: FiImage, accent: "text-violet-400" },
  { title: "Autoship Bundles", description: "Maintain recurring product and fulfillment bundles.", href: "/admin/autoship", icon: FiRepeat, accent: "text-amber-400" },
  { title: "Custom Fields", description: "Review product and document field definitions used by local data and integrations.", href: "/admin/custom-fields", icon: FiDatabase, accent: "text-cyan-400" },
  { title: "Product Data Health", description: "Review orphaned and incomplete product-linked records without hiding exceptions.", href: "/admin/orphaned-records", icon: FiPackage, accent: "text-red-400" },
]

export default function ProductsDataPage() {
  return <AdminWorkspaceHub eyebrow="Catalog administration" title="Products & Data" description="Catalog configuration, reusable product assets and governed data intake." items={items} />
}
