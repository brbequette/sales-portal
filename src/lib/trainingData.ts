export interface TrainingModule {
  id: string
  title: string
  category: string
  content: string // Lightweight markdown (###, -, 1., **bold**)
}

export const trainingCategories = [
  "Getting Started",
  "Sales & Orders",
  "Communication",
  "Collections & Customers",
  "Timeclock & Payroll",
  "Commissions & Performance",
  "Tools & Resources",
  "Admin & Management",
]

export const trainingModules: TrainingModule[] = [
  // ─────────────────────────────── GETTING STARTED ───────────────────────────────
  {
    id: "getting-started-overview",
    title: "Welcome to the Titan Hub",
    category: "Getting Started",
    content: `
Welcome to the **Titan Diamond Unified Hub** — your single workspace for sales, collections, communication, commissions, and time tracking.

### What you can do here
- **Sales Hub** — your home dashboard: accounts, leads, follow-ups, and quick campaigns.
- **Sales Docs** — view and manage quotes, sales orders, and invoices.
- **Messages** — two-way SMS texting with customers.
- **Collections** — work overdue balances and log payment promises.
- **Commissions** — track payouts and estimated earnings.
- **Rep Stats** — see your performance analytics.
- **Tools & Media** — calculators, file sharing, and shared assets.
- **Training Hub** — these guides.

### Finding your way around
On desktop, the navigation rail sits on the left edge. On mobile, use the **bottom tab bar** for the four most-used sections and the **menu button** (top-left) for everything else.

### The global search bar
The bar at the very top searches **accounts, invoices, quotes, and products** at once. Start typing and pick a result to jump straight to it.
    `,
  },
  {
    id: "getting-started-quick-actions",
    title: "Quick Actions & Global Search",
    category: "Getting Started",
    content: `
The top bar follows you on every page so the things you do most are always one click away.

### Quick Add buttons (top right)
- **Catalog Lookup** — search the product catalog and view pricing without leaving your current screen.
- **Add Task** — create a follow-up or to-do from anywhere.
- **Add Account** — register a brand-new customer on the spot.

### The Communications dial pad
The round **phone button** in the bottom-right corner opens the floating Communications Hub for calling and texting from any page. See the **Communication** guides for details.

### Search tips
1. Type at least one character in the top search bar.
2. Results are grouped by Accounts, Invoices & Sales Orders, Deals & Quotes, and Products.
3. Click any result to open it. Selecting a product opens its detail card instantly.
    `,
  },
  {
    id: "getting-started-profile",
    title: "Your Profile & Preferences",
    category: "Getting Started",
    content: `
### Editing your settings
Click your **user avatar** (bottom of the desktop rail) to open **Settings**. From here you can review your name, role, and personal preferences.

### Roles & access
What you see depends on your role. Sales reps see their own accounts and numbers; managers, collections, and administrators unlock additional tools such as **Admin Settings**. If a section is missing, your role likely doesn't include it — ask an administrator.
    `,
  },

  // ─────────────────────────────── SALES & ORDERS ───────────────────────────────
  {
    id: "sales-hub-dashboard",
    title: "Working the Sales Hub",
    category: "Sales & Orders",
    content: `
The **Sales Hub** is your daily command center for accounts and leads.

### Account list
Your accounts appear in a sortable, filterable list. Use it to:
- Spot accounts that are due for a follow-up.
- Review status, quality, and last-contacted dates at a glance.
- Select one or many accounts with the checkboxes for bulk actions.

### Keeping accounts current
- **Status** marks where an account is in the pipeline (e.g. Lead, Active, Inactive).
- **Quality** flags how promising an account is.
- **Timezone** keeps your call timing polite — set it so the app knows the customer's local time.

Update these inline; changes save immediately and sync to Zoho CRM where applicable.
    `,
  },
  {
    id: "sales-orders",
    title: "Creating & Managing Orders",
    category: "Sales & Orders",
    content: `
The **Sales Docs** section manages all quotes, sales orders, and invoices.

### Building an order
1. Open the account or start a new document.
2. Use the **Product Catalog Lookup** to add line items — this guarantees the description and price match our live catalog.
3. Adjust quantities; totals calculate automatically.
4. Convert a quote to a sales order or invoice when the customer commits.

### Why use catalog lookup?
Our POS and Product Catalog are synchronized. Any item active in inventory is available to add, and pulling from the catalog prevents pricing mistakes and mismatched descriptions.

### Discounts, payments & fulfillment
From an invoice you can apply discounts, take payment, email the invoice, and trigger fulfillment — each action is recorded against the account.
    `,
  },
  {
    id: "point-of-sale",
    title: "Using the Point of Sale",
    category: "Sales & Orders",
    content: `
The built-in **Point of Sale (POS)** turns a catalog search into a finished order.

### Flow
1. Search the catalog and add products to the cart.
2. Set quantities and review the running total.
3. Attach the order to a customer account.
4. Complete the sale to generate the sales document.

### Good habits
- Always tie a sale to an account so it shows up in history and commissions.
- Double-check quantities before completing — the total feeds reporting and payouts.
    `,
  },
  {
    id: "catalog-lookup",
    title: "Product Catalog Lookup",
    category: "Sales & Orders",
    content: `
The **Catalog** gives you fast, accurate product info anywhere in the app.

### What you get
- Live pricing and SKUs straight from inventory.
- Product detail cards with images and specs.
- The same data the POS and order builder use, so quotes stay consistent.

### Tip
Use the top-bar **Catalog Lookup** button to check a price mid-call without losing your place.
    `,
  },
  {
    id: "tasks-followups",
    title: "Tasks & Follow-ups",
    category: "Sales & Orders",
    content: `
Never lose a lead — capture next steps as **Tasks**.

### Creating a task
1. Click **Add Task** in the top bar (available everywhere).
2. Link it to an account so it appears in that account's timeline.
3. Set a due date; the account's **next action date** updates so it surfaces when it's time.

### Where tasks show up
Open tasks appear on your dashboard and on the linked account, keeping your follow-up queue front and center.
    `,
  },
  {
    id: "campaign-management",
    title: "Bulk Campaigns (SMS / Email)",
    category: "Sales & Orders",
    content: `
The **Campaign** tool sends bulk SMS or email blasts to many customers at once from the Sales Hub.

### Permissions & limits
- You must be granted the **Send Campaigns** permission by an administrator.
- To prevent spam, non-admins can send **one blast every 5 minutes**.

### Sending a campaign
1. Open the **Sales Hub**.
2. Check the boxes next to the accounts you want to target (or use **Select All**).
3. Click **Create Campaign**.
4. (Optional) Load a **predefined template** to auto-fill the message and image.
5. Choose your channel (e.g. SMS) and a **Sender Number** assigned to you.
6. Write the message, add an optional image URL, and click **Send Blast Campaign**.

### Templates & numbers
Administrators manage templates and decide which sender numbers each rep may use, keeping outreach on-brand and compliant.
    `,
  },

  // ─────────────────────────────── COMMUNICATION ───────────────────────────────
  {
    id: "comms-overview",
    title: "Communication Hub Overview",
    category: "Communication",
    content: `
All calling and texting runs through **Zoho Voice**, integrated directly into the Hub. No separate phone app required.

### Two ways to reach customers
- **The floating dial pad** — the round phone button in the bottom-right corner opens a Keypad, SMS, and Recent tabs panel on any page.
- **The Messages section** — a full-screen inbox for two-way texting conversations.

### Account context
When you're on an account page, the dial pad automatically detects the customer and pre-loads their number and message history, so you can call or text without searching.
    `,
  },
  {
    id: "comms-calling",
    title: "Making & Logging Calls",
    category: "Communication",
    content: `
### Placing a call
1. Open the **dial pad** (bottom-right phone button) or click **Call** on an account.
2. The customer's number pre-fills when an account is in context; otherwise type it or use the keypad.
3. Press the green **call** button to initiate through Zoho Voice.

### During and after the call
- A live timer runs while connected.
- Press the red button to end and open **Call Wrap-up**.
- Choose an **outcome** (Completed, Left Voicemail, No Answer, Busy, Wrong Number) and add notes.
- Click **Save Log** — the call is recorded against the account and updates its last-contacted date.

### If dial-out isn't connected
If automatic dialing isn't provisioned for your line, the Hub switches to **manual mode**: dial on your handset and still log the call here so history and reporting stay complete.
    `,
  },
  {
    id: "comms-texting",
    title: "Texting Customers (SMS)",
    category: "Communication",
    content: `
Two-way SMS is built in through **Zoho Voice**.

### Sending a text
1. Open an account (or search one in the dial pad) and switch to the **SMS** tab, or open the **Messages** section.
2. Type your message and press **Send** (Enter sends; Shift+Enter adds a line).
3. The message goes out from your assigned sender number and is saved to the conversation thread.

### Inbound replies
When a customer texts back, the reply is matched to their account automatically and appears in the thread. Texts from unrecognized numbers are filed under an **Unknown SMS Sender** account so nothing gets lost.

### Reading threads
Conversations are laid out like a chat — your outbound messages on one side, the customer's replies on the other, newest at the bottom.
    `,
  },
  {
    id: "comms-messages-inbox",
    title: "The Messages Inbox",
    category: "Communication",
    content: `
The **Messages** section is your dedicated texting workspace.

### How it's organized
- Accounts with message history are listed, sorted by most recent activity.
- Select a conversation to read the full thread and reply.

### Best practices
- Keep replies prompt — accounts re-sort to the top when new messages arrive.
- Use clear, professional language; texts are part of the customer's permanent record.
    `,
  },
  {
    id: "comms-scripts",
    title: "Call Scripts & Advanced AI Assist",
    category: "Communication",
    content: `
### AI-Powered Call Scripts
The AI Sales Assistant is equipped with all approved talking points from the **Scripts** library. It uses advanced sales methodologies (Consultative, SPIN, Challenger, Value-Based) to generate a customized pitch for each account based on their order history, previous call notes, and objections.

### Fact-Finding First
For cold calls, the AI will prioritize **Fact-Finding** to identify decision-makers, pain points, and current suppliers. It will not recommend pitching products until enough information is collected.

### Targeted Recommendations
When calling an active customer, the AI automatically analyzes their past orders and suggests the next logical product to pitch (including recommended pricing and quantities). It pre-fills the context using previous call logs so you never have to ask the customer the same question twice.

### Next-Best Actions
At the end of every AI-generated script, you will find a "Next-Best Actions / Insights" section that gives you clear talking points and suggests the strongest closing strategy for that specific customer.
    `,
  },

  // ─────────────────────────────── COLLECTIONS ───────────────────────────────
  {
    id: "collections",
    title: "Managing Customer Collections",
    category: "Collections & Customers",
    content: `
The **Collections** tab tracks overdue invoices and customer payments.

### Daily workflow
1. Review accounts with outstanding balances, prioritized by how overdue they are.
2. Call or text the customer (the dial pad detects the account automatically).
3. Log the outcome, notes, and any **payment promise** with a follow-up date.

### Constant Vig (late fees)
For late payments the system automatically calculates a **Constant Vig** based on days overdue. In a customer's collection profile you can see the original invoice amount separated from the accrued late fees.

### Logging collection calls
Use the collection call log to record promises to pay and schedule the next touch — the account resurfaces when the follow-up is due.
    `,
  },
  {
    id: "account-management",
    title: "Account Profiles & History",
    category: "Collections & Customers",
    content: `
Every customer has a single profile that ties everything together.

### What's on an account
- **Contacts** with phone numbers used for calling and texting.
- **Purchase history** and products purchased.
- **Deals/quotes** and invoice history.
- **Notes, calls, and messages** in one timeline.
- **Analytics** summarizing the relationship.

### Keeping data clean
- Mark the **primary contact** so calls and texts use the right number.
- Set the account **timezone** for considerate call timing.
- Keep **status** and **quality** current so dashboards and reassignment work correctly.
    `,
  },

  // ─────────────────────────────── TIMECLOCK ───────────────────────────────
  {
    id: "timeclock-basics",
    title: "How the Timeclock Works",
    category: "Timeclock & Payroll",
    content: `
The Hub uses an **automated timeclock** so you rarely have to think about it.

### Automatic tracking
You're clocked in the moment you open the Hub. Activity is tracked as you work. After **20 minutes idle** you're marked **Away** and clocked out for that gap; when you return you're clocked back in automatically.

### Manual control
The top-bar widget shows your status and today's hours. Use the **Clock In / Clock Out** button there if you ever need to toggle manually, and click the hours to open your full **Timesheet**.

### Requesting a correction
1. Open your **Timesheet**.
2. Click **Request Change** on the entry that's wrong.
3. Submit the corrected times — an administrator reviews and approves the change.
    `,
  },

  // ─────────────────────────────── COMMISSIONS & PERFORMANCE ───────────────────────────────
  {
    id: "commissions",
    title: "Tracking Your Commissions",
    category: "Commissions & Performance",
    content: `
The **Commissions** section shows what you've earned and what's pending.

### What you'll see
- **Estimated commissions** based on your closed sales.
- **Payouts** that have been recorded by management.
- A running view of earnings over time.

### How it's calculated
Commissions derive from the sales tied to your accounts and orders — another reason to always attach sales to the right account. If a number looks off, check that the underlying order is linked to you, then raise it with a manager.
    `,
  },
  {
    id: "rep-stats",
    title: "Reading Your Rep Stats",
    category: "Commissions & Performance",
    content: `
**Rep Stats** turns your activity into performance insight.

### Metrics
- Calls, texts, and outreach volume.
- Sales activity and conversion trends.
- Comparison of your activity over time.

### Using stats
Look for patterns: which days and call windows convert best, and where follow-ups are slipping. Pair this with your task queue to focus effort where it pays off.
    `,
  },

  // ─────────────────────────────── TOOLS ───────────────────────────────
  {
    id: "tools-media",
    title: "Tools & Media Library",
    category: "Tools & Resources",
    content: `
The **Tools & Media** area collects utilities and shared files.

### What's inside
- **Profit Calculator** and other quick calculators.
- **File sharing** and shared **media assets** (images, documents, flipbooks) for customer-facing material.

### Sharing assets
Browse the media library, then share approved images and documents with customers. Administrators manage which assets are available.
    `,
  },

  // ─────────────────────────────── ADMIN ───────────────────────────────
  {
    id: "admin-overview",
    title: "Admin: Settings Overview",
    category: "Admin & Management",
    content: `
Administrators and managers get an **Admin Settings** hub with controls that govern the whole portal.

### Sections
- **Users** — accounts, roles, and permissions.
- **Settings** — system configuration and integrations.
- **Communications** — Zoho numbers and messaging configuration.
- **Campaigns** — templates and campaign permissions.
- **Scripts** — the shared call-script library.
- **Holidays** — company holiday calendar for payroll.
- **Payouts** — record and adjust commission payouts.
- **Team Timeclock** — review and approve everyone's hours.
- **Vig** — late-fee settings.
- **Update Accounts** — bulk account maintenance.
    `,
  },
  {
    id: "admin-users",
    title: "Admin: Users & Permissions",
    category: "Admin & Management",
    content: `
Manage who can do what from **Admin → Users**.

### Tasks
1. Create or edit a user and assign their **role** (rep, collections, manager, administrator).
2. Grant feature permissions such as **Send Campaigns**.
3. Assign the **Zoho sender numbers** a rep may text from.

### Note on roles
Role names containing "admin", "manager", or "collections" unlock elevated navigation. Keep roles accurate so people see exactly the tools they need.
    `,
  },
  {
    id: "admin-communications",
    title: "Admin: Communications & Zoho Numbers",
    category: "Admin & Management",
    content: `
Configure calling and texting from **Admin → Communications**.

### Zoho phone numbers
- Add the org's Zoho Voice numbers and mark a **default** sender.
- Assign numbers to specific reps so they only text from approved lines.

### Required environment configuration
Calling and texting rely on Zoho credentials being set in the site environment (handled by an administrator/developer):
- A Zoho OAuth **refresh token**, **client ID**, and **client secret** for token refresh.
- The Zoho **data center** region.
- A default **from number** (or the numbers configured here).

When those are present, outbound SMS sends through Zoho Voice, inbound texts are captured by the webhook, and click-to-call connects automatically.
    `,
  },
  {
    id: "admin-timeclock",
    title: "Admin: Team Timeclock & Approvals",
    category: "Admin & Management",
    content: `
Review and approve hours from **Admin → Team Timeclock**.

### Weekly view
Entries are grouped into **weeks** for easy payroll.

### Editing time
Click the **edit (pencil)** icon next to any entry to override an employee's clock-in or clock-out time.

### Approving change requests
Pending requests are highlighted in orange. Click **Approve** or **Reject** — approved requests permanently update that employee's timesheet.
    `,
  },
  {
    id: "admin-payouts-vig",
    title: "Admin: Payouts, Vig & Campaigns",
    category: "Admin & Management",
    content: `
### Payouts
Record commission payouts and adjustments under **Admin → Payouts**. These feed each rep's Commissions view.

### Vig (late fees)
Set the late-fee rules under **Admin → Vig**. These drive the **Constant Vig** customers see in Collections, and can sync to Zoho.

### Campaign templates
Under **Admin → Campaigns**, create reusable message templates and control which reps may send blasts. Standardized templates keep outreach consistent and compliant.

### Holidays
Maintain the company holiday calendar under **Admin → Holidays** so payroll reflects paid days correctly.
    `,
  },
]
