// Feature permission keys and their descriptions
// When permissions is null/undefined on a user, they get ALL features (admin default)
// When permissions is set, only enabled features are accessible

export interface UserPermissions {
  // Navigation / Page Access
  dashboard: boolean
  salesBoard: boolean
  salesDocuments: boolean
  collections: boolean
  commissions: boolean
  messages: boolean
  tasks: boolean
  timeclock: boolean
  catalog: boolean
  tools: boolean
  training: boolean

  // Actions
  sendCampaigns: boolean
  recordPayments: boolean
  applyDiscounts: boolean
  convertDocuments: boolean
  voidDocuments: boolean
  sendEmails: boolean
  createPackages: boolean
  createDropships: boolean
  createAccounts: boolean
  editAccountDetails: boolean
  processCosts: boolean        // trigger cost recalculation on docs
  logCalls: boolean            // access call log modals (sales + collection)

  // Data Visibility
  viewCostBreakdown: boolean   // see dead cost / VIG / margin on documents
  viewCommissions: boolean     // see commission amounts on docs and rep stats

  // Admin
  adminAccess: boolean
  manageUsers: boolean
  manageSettings: boolean
  runScripts: boolean
  viewAllReps: boolean
  manageVisibility: boolean    // access the VisibilityConfigPanel
}

export const PERMISSION_GROUPS: { label: string; permissions: { key: keyof UserPermissions; label: string; description: string }[] }[] = [
  {
    label: "Page Access",
    permissions: [
      { key: "dashboard", label: "Dashboard", description: "Access the main dashboard with KPIs and account pipeline" },
      { key: "salesBoard", label: "Sales Board", description: "Access the Sales Board with quotes, SOs, and invoices" },
      { key: "salesDocuments", label: "Sales Documents", description: "View and manage quotes, sales orders, and invoices" },
      { key: "collections", label: "Collections", description: "Access the collections board for overdue accounts" },
      { key: "commissions", label: "Commissions", description: "View commission statements and payouts" },
      { key: "messages", label: "Messages", description: "Access SMS messaging with customers" },
      { key: "tasks", label: "Tasks", description: "View and create tasks" },
      { key: "timeclock", label: "Timeclock", description: "Clock in/out and view time entries" },
      { key: "catalog", label: "Catalog", description: "View the product catalog" },
      { key: "tools", label: "Tools", description: "Access sales tools and AI helpers" },
      { key: "training", label: "Training Hub", description: "Access the training documentation" },
    ]
  },
  {
    label: "Actions",
    permissions: [
      { key: "sendCampaigns", label: "Send Campaigns", description: "Create and send bulk SMS/email campaigns" },
      { key: "recordPayments", label: "Record Payments", description: "Record customer payments on invoices" },
      { key: "applyDiscounts", label: "Apply Discounts", description: "Apply early-pay or custom discounts to invoices" },
      { key: "convertDocuments", label: "Convert Documents", description: "Convert quotes to SOs and SOs to invoices" },
      { key: "voidDocuments", label: "Void Documents", description: "Void invoices, sales orders, and quotes" },
      { key: "sendEmails", label: "Send Emails", description: "Email documents to customers via Zoho" },
      { key: "createPackages", label: "Create Packages", description: "Create shipping packages for sales orders" },
      { key: "createDropships", label: "Create Dropships", description: "Create dropship purchase orders" },
      { key: "createAccounts", label: "Create Accounts", description: "Create new customer accounts" },
      { key: "editAccountDetails", label: "Edit Account Details", description: "Edit account information, contacts, and status" },
      { key: "processCosts", label: "Recalculate Costs", description: "Trigger cost/profit/commission recalculation on any document" },
      { key: "logCalls", label: "Log Calls", description: "Access sales and collection call log modals" },
    ]
  },
  {
    label: "Data Visibility",
    permissions: [
      { key: "viewCostBreakdown", label: "View Cost Breakdown", description: "See dead cost, VIG, and margin details on documents" },
      { key: "viewCommissions", label: "View Commissions", description: "See commission amounts on documents and rep stats" },
    ]
  },
  {
    label: "Admin",
    permissions: [
      { key: "adminAccess", label: "Admin Panel", description: "Access the admin panel and sidebar" },
      { key: "manageUsers", label: "Manage Users", description: "View and edit user accounts and permissions" },
      { key: "manageSettings", label: "Manage Settings", description: "Edit system settings, AI prompts, and campaign limits" },
      { key: "runScripts", label: "Run Scripts", description: "Execute Zoho Books scripts and admin operations" },
      { key: "viewAllReps", label: "View All Reps", description: "See all sales reps' data, not just own accounts" },
      { key: "manageVisibility", label: "Manage Visibility", description: "Configure which fields/sections each role can see or edit" },
    ]
  }
]

// Default permissions: all enabled (used for admins or when permissions is null)
export const ALL_PERMISSIONS: UserPermissions = {
  dashboard: true,
  salesBoard: true,
  salesDocuments: true,
  collections: true,
  commissions: true,
  messages: true,
  tasks: true,
  timeclock: true,
  catalog: true,
  tools: true,
  training: true,
  sendCampaigns: true,
  recordPayments: true,
  applyDiscounts: true,
  convertDocuments: true,
  voidDocuments: true,
  sendEmails: true,
  createPackages: true,
  createDropships: true,
  createAccounts: true,
  editAccountDetails: true,
  processCosts: true,
  logCalls: true,
  viewCostBreakdown: true,
  viewCommissions: true,
  adminAccess: true,
  manageUsers: true,
  manageSettings: true,
  runScripts: true,
  viewAllReps: true,
  manageVisibility: true,
}

// Default permissions for a new sales rep (restricted)
export const DEFAULT_REP_PERMISSIONS: UserPermissions = {
  dashboard: true,
  salesBoard: false,
  salesDocuments: true,
  collections: false,
  commissions: true,
  messages: true,
  tasks: true,
  timeclock: true,
  catalog: true,
  tools: true,
  training: true,
  sendCampaigns: false,
  recordPayments: false,
  applyDiscounts: false,
  convertDocuments: false,
  voidDocuments: false,
  sendEmails: true,
  createPackages: false,
  createDropships: false,
  createAccounts: true,
  editAccountDetails: true,
  processCosts: false,
  logCalls: true,
  viewCostBreakdown: false,
  viewCommissions: false,
  adminAccess: false,
  manageUsers: false,
  manageSettings: false,
  runScripts: false,
  viewAllReps: false,
  manageVisibility: false,
}

// Resolve a user's effective permissions
export function resolvePermissions(dbPermissions: any, role?: string): UserPermissions {
  const isAdmin = role?.toLowerCase().includes("admin") || role === "Administrator"
  
  // Admins with no custom permissions = all access
  if (isAdmin && !dbPermissions) return ALL_PERMISSIONS
  
  // If permissions are explicitly set, use them
  if (dbPermissions && typeof dbPermissions === 'object') {
    return { ...ALL_PERMISSIONS, ...dbPermissions } as UserPermissions
  }
  
  // Non-admin with no permissions set = default rep permissions
  if (!isAdmin) return DEFAULT_REP_PERMISSIONS
  
  return ALL_PERMISSIONS
}
