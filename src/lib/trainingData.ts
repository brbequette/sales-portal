export interface TrainingModule {
  id: string
  title: string
  category: string
  content: string // Markdown or plain text instructions
}

export const trainingCategories = [
  "Getting Started",
  "Sales & Orders",
  "Timeclock & Payroll",
  "Collections & Customers",
  "Admin & Management"
]

export const trainingModules: TrainingModule[] = [
  {
    id: "getting-started-overview",
    title: "Welcome to the Sales Portal",
    category: "Getting Started",
    content: `
Welcome to the Titan Diamond Sales Portal! 

This system is your central hub for tracking your time, viewing your sales documents, managing your collections, and viewing your commissions. 

### Navigation
On the left-hand side (or bottom on mobile), you'll find the main navigation menu. You can quickly jump between:
- **Sales Hub**: Your main dashboard.
- **Sales Docs**: For viewing and managing your quotes and invoices.
- **Collections**: For managing customer balances and overdue accounts.
- **Commissions**: To track your payouts and estimated commissions.
- **Rep Stats**: For analytics on your performance.
- **Tools & Media**: Helpful utilities like the Profit Calculator and File Sharing.

### Quick Actions
At the top right of the screen, you have Quick Add buttons to quickly create new Tasks, search the Catalog, or add a New Account from anywhere in the app!
    `
  },
  {
    id: "timeclock-basics",
    title: "How to Track Your Time",
    category: "Timeclock & Payroll",
    content: `
The Sales Portal uses an **Automated Timeclock** system.

### How it works
You do **not** need to manually clock in or out every day. The moment you open the Sales Portal (such as via the Zoho CRM Web Tab), you are automatically clocked in.

Your activity is tracked automatically as you interact with the app. If you are inactive for more than 10 minutes, the system will automatically mark you as "Away" and clock you out for that idle period. When you return, it will automatically clock you back in!

### Viewing Your Time
You can view your current time status at the top right of the screen. Clicking it will take you to your personal **Timesheet**.

### Requesting Changes
If you forgot to log in or need to adjust your time, simply go to your Timesheet, click the "Request Change" button on any entry, and submit a request to an Administrator.
    `
  },
  {
    id: "sales-orders",
    title: "Creating & Managing Orders",
    category: "Sales & Orders",
    content: `
The **Sales Docs** section allows you to manage all quotes and invoices.

### Creating an Order
When creating an order, ensure you use the **Product Catalog Lookup**. This ensures the product description and price accurately matches our database. The line items will automatically populate based on the active items in the POS.

### Syncing
Our POS and Product Catalog are synchronized. If an item is active in the inventory system, it will be available for you to add to a quote or invoice.
    `
  },
  {
    id: "collections",
    title: "Managing Customer Collections",
    category: "Collections & Customers",
    content: `
The **Collections** tab is used to track overdue invoices and customer payments.

### Constant Vig
For late payments, the system automatically calculates a "Constant Vig" (late fee) based on the days overdue. You can view the exact breakdown of the original invoice amount versus the accrued late fees directly in the customer's collection profile.

You can log notes, schedule follow-up calls, and track payment promises directly from this screen.
    `
  },
  {
    id: "admin-timeclock",
    title: "Admin: Managing Team Timeclocks",
    category: "Admin & Management",
    content: `
Administrators have access to the **Admin Settings -> Team Timeclock** dashboard.

### Weekly View
The Admin Timeclock page groups all employee time entries into **Weeks**. This allows for easy payroll calculation.

### Editing Time
You can manually override any employee's clock-in or clock-out time by clicking the "Edit" (pencil) icon next to their entry.

### Approving Requests
If an employee requests a time change, it will appear as a "Pending Request" highlighted in orange. You can click "Approve" or "Reject". If approved, their timesheet will be permanently updated to reflect the requested times.
    `
  }
]
