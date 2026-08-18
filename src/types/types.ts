// SalesPortal shared type definitions

export interface ZohoUser {
  id: string
  name: string
  email: string
  role?: string
}

export interface Contact {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string
  isPrimary: boolean
}

export interface Invoice {
  id: string
  invoiceNumber: string
  amount: number
  balance: number
  dueDate: string
  status: string
  items?: InvoiceItem[]
}

export interface InvoiceItem {
  name: string
  quantity: number
  price: number
  total: number
}

export interface Account {
  zohoId: string
  name: string
  industry?: string
  status: string
  tags?: string
  owner?: {
    id: string
    name: string
    email: string
  }
  totalRevenue?: number
  daysSinceLastPurchase?: number
  invoices: Invoice[]
  contacts: Contact[]
  creditLimit?: number
  outstandingBalance?: number
}

export interface Deal {
  id: string
  dealName: string
  stage: string
  amount: number
  closingDate: string
  invoicedItems?: string
}

export interface Commission {
  id: string
  dealName: string
  accountName: string
  amount: number
  commissionRate: number
  commissionAmount: number
  status: 'pending' | 'approved' | 'paid'
  date: string
}

export interface SalesTask {
  id: string
  subject: string
  dueDate: string
  priority: 'High' | 'Medium' | 'Low'
  status: string
  relatedTo?: string
}

export interface MediaAsset {
  id: string
  title: string
  type: string
  url: string
  size: string
  category: string
}
