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

const rawTrainingModules: TrainingModule[] = [
  // ------------------------------- GETTING STARTED -------------------------------
  {
    id: "getting-started-overview",
    title: "Welcome to the Titan Hub",
    category: "Getting Started",
    content: `
Welcome to the **Titan Diamond Unified Hub** -- your single workspace for sales, collections, communication, commissions, and time tracking.

### What you can do here
- **Sales Hub** -- your home dashboard: accounts, leads, follow-ups, and quick campaigns.
- **Sales Docs** -- view and manage quotes, sales orders, and invoices.
- **Messages** -- two-way SMS texting with customers.
- **Collections** -- work overdue balances and log payment promises.
- **Commissions** -- track payouts and estimated earnings.
- **Rep Stats** -- see your performance analytics.
- **Tools & Media** -- calculators, file sharing, and shared assets.
- **Training Hub** -- these guides.

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
- **Catalog Lookup** -- search the product catalog and view pricing without leaving your current screen.
- **Add Task** -- create a follow-up or to-do from anywhere.
- **Add Account** -- register a brand-new customer on the spot.

### The Communications dial pad
The round **phone button** in the bottom-right corner opens the floating Communications Hub for calling and texting from any page. See the **Communication** guides for details.

### Search tips
1. Type at least one character in the top search bar.
2. Results are grouped by **Accounts**, **Invoices & Sales Orders**, **Deals**, and **Products**.
3. Click any result to open it. Clicking an Account goes to the Account Hub. Clicking an Invoice, Deal, or Quote navigates to the related account page automatically. Selecting a product opens its detail card instantly.
4. If an account page ever shows "Account not found," the portal will automatically attempt to re-import it from Zoho CRM. This is rare and usually means the sync hasn't run yet -- try refreshing after a moment.
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
What you see depends on your role. Sales reps see their own accounts and numbers; managers, collections, and administrators unlock additional tools such as **Admin Settings**. If a section is missing, your role likely doesn't include it -- ask an administrator.
    `,
  },

  // ------------------------------- SALES & ORDERS -------------------------------
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
- **Timezone** keeps your call timing polite -- set it so the app knows the customer's local time.

### Sorting accounts
Use the **Sort** dropdown (top of the account list) to order accounts by:
- **Default** -- standard pipeline order.
- **Time Zone (A-Z / Z-A)** -- group by time zone for call-block planning.
- **Orders (Newest / Oldest)** -- sort by most recent purchase date.
- **LTV (High to Low)** -- highest-spending customers first. Best for big-account prioritization.
- **LTV (Low to High)** -- surface low-spend accounts that may need nurturing or have growth potential.

The selected sort is **saved automatically** and restored on your next visit.

### Product Buyer Search
The **"Filter by product..."** input (amber icon, in the account list toolbar) narrows the list to accounts that purchased a specific product:
- Type any part of a product name (e.g. "medusa", "t-shirt", "14-inch")
- Only accounts with that product on a cached invoice line item will appear
- An amber **Bought: [term]** badge shows in the active filters strip -- click X to clear
- Partial matches work: "14" matches "Medusa 14-inch", "Diamond 14", etc.
- Requires line items to be cached first (see **Admin > Data Backfill**)

### Filtering accounts
Click **Filters** to open the full filter drawer. Active filters show as badges below the toolbar. Available filters: status, industry, quality, timezone, year of last purchase, LTV range, and missing-info flags (no phone, no email, no contacts).

Update account fields inline; changes save immediately and sync to Zoho CRM where applicable.
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
2. Use the **Product Catalog Lookup** to add line items -- this guarantees the description and price match our live catalog.
3. Adjust quantities; totals calculate automatically.
4. Convert a quote to a sales order or invoice when the customer commits.

### Why use catalog lookup?
Our POS and Product Catalog are synchronized. Any item active in inventory is available to add, and pulling from the catalog prevents pricing mistakes and mismatched descriptions.

### Discounts, payments & fulfillment
From an invoice you can apply discounts, take payment, email the invoice, and trigger fulfillment -- each action is recorded against the account.
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
- Double-check quantities before completing -- the total feeds reporting and payouts.
    `,
  },
  {
    id: "order-builder",
    title: "Order Builder -- Building Orders on a Call",
    category: "Sales & Orders",
    content: `
The **Order Builder** appears in the **Titan Dialer**, the **Account Page Dialer**, and the **Communication Center** -- all three use the exact same interface so the process is universal.

### How to add products

**Option 1 -- Blade Lookup (fastest for blades)**
1. Tap **Blade Lookup** to expand the filter panel.
2. Set **Application** (Asphalt, Concrete, General Purpose, etc.), **Size** (4.5"-20"+), and **Type** (Segmented, Turbo, Continuous Rim, etc.).
3. The system shows **Good / Better / Best** card options based on price tier -- Good is entry level, Better is mid-range, Best is premium.
4. Tap **Add** on the card to instantly add it to the order.

**Option 2 -- Product Search**
- Type in the search box (2+ characters) to search the full catalog by name, SKU, or category.
- Tap a result to add it to the order.

**Option 3 -- Quick Add**
- Use the pill buttons under "Top Blades" to add the 10 most popular blades in one tap.

### Managing line items

**Sold Items (amber section)**
- Items you are charging for (paidQty > 0) appear here.
- **Qty**: Use the **−** and **+** buttons, or **click the number directly** to type in any quantity.
- **Unit Price**: Click the price field to edit it directly.
- **Line $**: Calculated automatically (paidQty × unitPrice).

**Promotional / Gift Items (green 🎁 section)**
- Items being given away FREE appear here -- completely separated from sold items.
- To add a free qty to a product, use the **"Add Promo Qty"** panel at the bottom (shows all items with a free qty stepper).
- Free items are tracked for cost accounting but show $0.00 on the order preview.

> **Important**: Always put gift/promotional items in the Free Qty field -- never as a $0 sold item. This keeps reporting accurate.

### Order Summary & Financials
- **Order Total** -- sum of all paid line items only.
- **Dead Cost** -- your cost for all items (paid + free).
- **Profit after VIG** -- profit after applying the 1.3× VIG multiplier on paid items.
- **Commission** -- your 50% cut of profit after VIG (shown for motivation!).
- **Margin %** -- color-coded: green ≥30%, amber ≥15%, red <15%.

### Preview Sales Order
Tap **Preview Sales Order** to see a formatted order summary with:
- Bill To / Ship To address
- Sold Items table (paid lines only)
- 🎁 Promotional Items table (free lines only -- clearly separated)
- Order Total and profit breakdown

This preview is for reference only -- use the **POS** screen if you need to generate an actual Zoho Books quote or sales order.
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
Never lose a lead -- capture next steps as **Tasks**.

### Creating a task
1. Click **Add Task** in the top bar, or use the **+ Task** button on any account page to auto-link it.
2. Link it to an account so it appears in that account's timeline.
3. Set a **due date and time** -- the time field lets you schedule tasks down to the minute for calls and follow-ups.

### Where tasks show up
Open tasks appear on your dashboard **Task Manager** and on the linked account. When a time is set, the display shows "Due: Jun 30, 2026 at 2:30 PM" so you know exactly when to act.
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

  // ------------------------------- COMMUNICATION -------------------------------
  {
    id: "comms-overview",
    title: "Communication Hub Overview",
    category: "Communication",
    content: `
All calling and texting runs through **Zoho Voice**, integrated directly into the Hub. No separate phone app required.

### Two ways to reach customers
- **The floating dial pad** -- the round phone button in the bottom-right corner opens a Keypad, SMS, and Recent tabs panel on any page.
- **The Messages section** -- a full-screen inbox for two-way texting conversations.

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
- Click **Save Log** -- the call is recorded against the account and updates its last-contacted date.

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
Conversations are laid out like a chat -- your outbound messages on one side, the customer's replies on the other, newest at the bottom.
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
- Keep replies prompt -- accounts re-sort to the top when new messages arrive.
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

  // ------------------------------- COLLECTIONS -------------------------------
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

### Processing Payments
When a customer is ready to pay, click **Record Payment** on any invoice. You have two options:

- **Run Credit Card** -- Process a card payment through **Authorize.net** directly in the portal. Enter the card number, expiration, CVV, and billing ZIP. The system will charge the card and automatically record the payment in Zoho Books.
- **Manual Record** -- For payments made by check, ACH, wire, cash, or PayPal, select the payment method, enter the reference/auth code, and the payment will be recorded in Zoho Books.

### Credit Card Processing Steps
1. Open the invoice and click **Record Payment**.
2. Select the **Run Credit Card** tab.
3. Enter the payment amount (defaults to the full balance).
4. Fill in **cardholder name**, **card number**, **expiration**, **CVV**, and **ZIP**.
5. Click **Charge** -- the system tokenizes the card securely, charges it through Authorize.net, and records the payment in Zoho Books automatically.
6. If the charge succeeds but Zoho recording fails, you'll see a warning with the auth code so you can record it manually.

### Constant Vig (late fees)
For late payments the system automatically calculates a **Constant Vig** based on days overdue. In a customer's collection profile you can see the original invoice amount separated from the accrued late fees.

### Logging collection calls
Use the collection call log to record promises to pay and schedule the next touch -- the account resurfaces when the follow-up is due.

### Visibility by role
- **Collections role** -- sees **all** invoices across every rep and every account company-wide (same as admin view). The "Show All Reps" toggle is on by default.
- **Sales rep** -- sees only their own accounts' invoices.
- **Admin / Manager** -- sees everything.
    `,
  },
  {
    id: "account-management",
    title: "Account Profiles & History",
    category: "Collections & Customers",
    content: `
Every customer has a single profile that ties everything together. When you open an account, you land on **three tabs** at the top:

| Tab | What it does |
|-----|-------------|
| **Overview** | All account data in one place -- collapsible accordion sections for Contact & Addresses, Business Profile, All Contacts, Analytics, Recent Invoices, Deals, Transaction History, Products Purchased, and Tasks. Open only the sections you need. |
| **Comm Center** | The full Titan Dialer -- same layout as the Call Campaign screen. Shows a sticky HUD with the contact's name, phone, email, and stats. Includes the outreach script, fact-finding questions, blade pitch recommendations, order builder, and an Intel sidebar showing purchase history, notes, and invoices. Log calls with outcome, spoke-to, follow-up date, and notes inline. |
| **Quick Sale** | Full point-of-sale to place orders directly from the account page. |

### What's on an account
- **Left rail** -- always visible: Primary Contact (call/SMS buttons), overdue alert, Blade Profile, Top Products with quick reorder, and Notes.
- **Overview accordion** -- expand any section: Billing/Shipping Addresses, Primary Contact details, Business Profile, All Contacts & Notes, Analytics charts, Recent Invoices (last 5), Deals, full Transaction History (Data or Flipbook view), Products Purchased, and Tasks.
- **Business Profile** -- blade sizes, materials cut, current supplier, average blade cost, crew count, blades per order, improvement priority. Edit via the Edit Account modal.
- **Contacts** with phone numbers and email used for calling, texting, and emailing.

### Comm Center (Titan Dialer)
The Comm Center tab is a full dialer experience for the account:
1. **Sticky HUD** shows the primary contact's name, phone (click to copy for ZDialer), email, city/state, LTV, units bought, and overdue balance.
2. **Script toggle** -- Cold Call script (7 discovery questions) or Follow-Up script (personalized with purchase history).
3. **Fact-Finding** -- capture blade sizes, materials cut, supplier, crew count, blades/order, improvement priority inline.
4. **Pitch Recommendations** -- Good/Better/Best blade suggestions based on what the customer cuts.
5. **Order Builder** -- search catalog and build an order with paid/free qty and cost analysis.
6. **Intel sidebar** -- purchases, notes, and invoices tabs for full account context during the call.
7. **Inline log bar** -- Reached toggle, Spoke With, Outcome dropdown, Follow-up date, Notes, and **Log Call** button all on one row.

### Keeping data clean
- Mark the **primary contact** so the left rail and Comm Center use the right number first.
- Set the account **timezone** so the local time shows in the header.
- Keep **status** and **quality** current so dashboards and call lists work correctly.
- Update **business profile** fields from the fact-finding section of the Comm Center or the Edit Account modal.

### Customer location in Collections
The Collections page shows each customer's **city and state** below their name for quick location reference.
    `,
  },

  // ------------------------------- TIMECLOCK -------------------------------
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
3. Submit the corrected times -- an administrator reviews and approves the change.
    `,
  },

  // ------------------------------- COMMISSIONS & PERFORMANCE -------------------------------
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
Commissions derive from the sales tied to your accounts and orders -- another reason to always attach sales to the right account. If a number looks off, check that the underlying order is linked to you, then raise it with a manager.
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

  // ------------------------------- TOOLS -------------------------------
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

  // ------------------------------- ADMIN -------------------------------
  {
    id: "admin-overview",
    title: "Admin: Settings Overview",
    category: "Admin & Management",
    content: `
Administrators and managers get an **Admin Settings** hub with controls that govern the whole portal.

### Sections
- **Users** -- accounts, roles, and permissions.
- **Settings** -- system configuration and integrations.
- **Communications** -- Zoho numbers and messaging configuration.
- **Campaigns** -- templates and campaign permissions.
- **Scripts** -- the shared call-script library.
- **Holidays** -- company holiday calendar for payroll.
- **Payouts** -- record and adjust commission payouts.
- **Team Timeclock** -- review and approve everyone's hours.
- **Vig** -- late-fee settings.
- **Update Accounts** -- bulk account maintenance and owner reassignment. Changing account owner updates both the CRM Account record AND all associated Contacts to the new rep. Account owner name (first name) is shown as a sky-blue chip on every account card in the dashboard.
- **Data Backfill** -- one-time tool to populate full line items for all invoices, SOs, and quotes from Zoho Books. Enables the Product Buyer Search filter and instant-loading invoice modals.
    `,
  },
  {
    id: "admin-users",
    title: "Admin: Users & Permissions",
    category: "Admin & Management",
    content: `
Manage granular feature-level permissions from **Admin  to  Users**.

### Search, Sort & Filter
- **Search** -- Use the search bar at the top to find users by name or email.
- **Sort** -- Click column headers (Name, Email, Role, Accounts) to sort ascending/descending.
- **Filter by Role** -- Use the filter tabs (All / Admin / Reps) to narrow the user list.

### Account Count
Each user row displays how many accounts are currently assigned to them. This count updates automatically after bulk reassignment.

### User Permissions System
Click any user to expand their **permissions panel**. Each permission can be individually toggled on/off.

### Permission Groups
- **Page Access** -- Control which pages a user can see (Dashboard, Sales Docs, Collections, Commissions, Messages, Tasks, Timeclock, Catalog, Tools, Training)
- **Actions** -- Control what actions a user can perform (Send Campaigns, Record Payments, Apply Discounts, Convert/Void Documents, Send Emails, Create Packages/Dropships/Accounts, Edit Account Details)
- **Admin** -- Control admin-level access (Admin Panel, Manage Users, Manage Settings, Run Scripts, View All Reps)

### Quick Actions
- **Enable All** -- Grants all permissions (full admin access)
- **Rep Defaults** -- Sets standard sales rep permissions (basic page access, no admin features)
- **Assign Accounts** -- Opens a modal to bulk-reassign accounts to the selected user. Search the full account list, select multiple accounts, then click "Reassign to [User Name]". This syncs both Zoho CRM and the local database. A progress bar shows real-time status during reassignment.
    `,
  },
  {
    id: "admin-communications",
    title: "Admin: Communications & Zoho Numbers",
    category: "Admin & Management",
    content: `
Configure calling and texting from **Admin  to  Communications**.

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
Review and approve hours from **Admin  to  Team Timeclock**.

### Weekly view
Entries are grouped into **weeks** for easy payroll.

### Editing time
Click the **edit (pencil)** icon next to any entry to override an employee's clock-in or clock-out time.

### Approving change requests
Pending requests are highlighted in orange. Click **Approve** or **Reject** -- approved requests permanently update that employee's timesheet.
    `,
  },
  {
    id: "admin-payouts-vig",
    title: "Admin: Payouts, Vig & Campaigns",
    category: "Admin & Management",
    content: `
### Payouts
Record commission payouts and adjustments under **Admin  to  Payouts**. These feed each rep's Commissions view.

### Vig (late fees)
Set the late-fee rules under **Admin  to  Vig**. These drive the **Constant Vig** customers see in Collections, and can sync to Zoho.

### Campaign templates
Under **Admin  to  Campaigns**, create reusable message templates and control which reps may send blasts. Standardized templates keep outreach consistent and compliant.

### Holidays
Maintain the company holiday calendar under **Admin  to  Holidays** so payroll reflects paid days correctly.
    `,
  },
  {
    id: "admin-books-scripts",
    title: "Admin: Books Scripts & Cost Processing",
    category: "Admin & Management",
    content: `
### Zoho Books Maintenance Scripts
Navigate to **Admin  to  Books Scripts** to access maintenance tools for Zoho Books data.

### Bulk Process Invoice Costs
The **Bulk Process Invoice Costs** tool recalculates all financial fields for invoices:
- **Dead Cost Total** -- Sum of all line item purchase costs
- **Dead Cost Subject to VIG** -- Costs where "Subject to VIG" is checked
- **Dead Cost No VIG** -- Costs where "Subject to VIG" is unchecked (including gift items)
- **Dead Cost Plus VIG** -- (Subject to VIG × VIG Rate) + No VIG
- **Profit** -- Sub Total minus Dead Cost Plus VIG, CC Fees, and Additional Costs (Insurance is company revenue -- NOT deducted from profit)
- **Sales Commission** -- Profit × Commission %
- **Paid In Full Date** -- Auto-set when invoice balance reaches $0

Filter options: **Unpaid Only** (default), **Last 90 Days**, or **All Invoices**.
Only fields that actually changed are written, preventing unnecessary API calls.

### Incremental (Single Invoice) Processing
Click **Process Costs** on any invoice detail modal to recalculate just that invoice.

### Credit Card Processing Fees
When a credit card payment is processed through the portal, the system automatically:
1. Calculates the **CC Processing Fee** (4.5% of the charge amount)
2. Writes the fee to the **CREDIT CARD PROCESSING FEES** field
3. Records the **CC CHARGE(S) BREAKDOWN** with auth code, card type, last 4 digits, and amount
4. If the invoice is fully paid, sets the **PAID IN FULL DATE**

### Gift Items
Gift items are always included in **Dead Costs** but placed in the **No VIG** bucket -- they never have VIG applied to them.

### Loop Prevention
The system prevents update loops when Zoho workflows trigger callbacks after field updates. Each invoice has a 60-second cooldown after processing.

### Needs Shipping Costs Flag
When an invoice has a **$0.00 shipping charge**, the system flags it with a **"Needs Shipping Costs"** warning:
- **Invoice Detail Modal** -- A pulsing amber alert banner appears in the Data View panel
- **Account Invoice List** -- An amber **"⚠ No Ship $"** badge appears next to the status
- This flag only appears on non-draft, non-void invoices
- To resolve: update the shipping charge in Zoho Books
    `,
  },
  {
    id: "admin-data-backfill",
    title: "Admin: Data Backfill (Line Items)",
    category: "Admin & Management",
    content: `
The **Data Backfill** tool at **Admin > Data Backfill** is a one-time operation that populates full line-item detail for all invoices, sales orders, and quotes in the local database.

### Why it matters
With line items cached locally, the portal can:
- Run the **Product Buyer Search** filter -- instantly find all accounts that bought a specific product
- Open invoice/SO/quote detail modals **instantly** without live Zoho API calls
- Show purchased products across dashboard filters and account pages

### Phase 1 -- Map Zoho Books IDs (~3 minutes)
Enumerates all Zoho Books invoices, SOs, and estimates (200 per page) and writes the Books ID into each matching local record. Must run before Phase 2.
- Click **Run Phase 1** on the backfill page
- Takes approximately 3 minutes
- Safe to re-run -- already-mapped records are skipped

### Phase 2 -- Fetch Line Items (~5-8 hours total)
Fetches full detail (line items, custom fields, balance) for every uncached record, at 50 calls/minute.
- Click **Start Phase 2** -- runs continuously in batches of 18 records (~25 seconds each)
- Progress is saved after every batch -- close the tab and resume anytime with **Resume Phase 2**
- A live progress bar and ETA are shown throughout

### Duplicate protection built in
- Exact doc-number matching only -- no partial/fuzzy matches that could stamp the wrong record
- A Books ID can only be written to one local record -- conflicts are logged and skipped
- Line items are always replaced from Zoho, never appended on top of existing data
- A concurrency lock prevents two browser tabs from processing the same batch simultaneously

### After completion
- The daily 2 AM sync keeps data current -- the backfill only needs to run once
- All invoice modals load from cache; Product Buyer Search works for all 15,500+ accounts
    `,
  },
  {
    id: "tools-task-reminders",
    title: "Task Reminders",
    category: "Tools & Resources",
    content: `
### Setting up notifications
Before reminders will work, you need to enable notifications in **User Settings** (gear icon in the top bar):
1. **Push Notifications** -- click **Enable** to allow browser notifications. A toggle lets you turn them on/off.
2. **SMS Notifications** -- toggle on to receive text reminders.
3. **Email Notifications** -- toggle on to receive email reminders.
4. **Default Reminder Timing** -- choose how far in advance reminders fire (5 min, 30 min, 1 hour, 1 day, etc.).

### Setting a reminder on a task
When creating or editing a task you can set a **Reminder Date/Time** and choose **Notify Via** (push, SMS, or email).

### How reminders work
The system checks for pending reminders every 60 seconds while the dashboard is open. When a reminder fires:
- **Push** -- a browser notification is sent to all your registered devices.
- **SMS / Email** -- a text or email is sent to your contact info on file.
- The task card shows a pulsing amber **🔔 REMINDER!** badge so you can spot it at a glance.

### Tips
- Set reminders **before** a task's due date so you have time to act.
- Make sure you've clicked the **🔔 bell icon** in the top bar at least once to grant browser notification permission.
- Your notification preferences are saved per-user and persist across sessions.
    `,
  },
  {
    id: "invoice-process-costs",
    title: "Processing Invoice Costs & Commissions",
    category: "Sales Docs",
    content: `
### Process Costs Button

When viewing any **Invoice** in the details modal, you'll see an amber **Process Costs** button in the action bar.

Clicking it will:
1. Fetch the full invoice from Zoho Books (including line items).
2. Calculate **Dead Cost Total** -- the sum of each line item's cost × quantity.
3. Split dead cost into **Subject to VIG** and **No VIG** categories:
   - Items marked as **gifts**  to  No VIG.
   - Items with the "Subject to VIG" checkbox **unchecked**  to  No VIG.
   - All other items  to  Subject to VIG.
4. Calculate **Dead Cost Plus VIG** = (Subject to VIG × VIG Rate) + No VIG.
5. Deduct CC Fees and Additional Costs only. Insurance is **NOT** deducted -- it is collected by the company.
6. Calculate **Profit** = Sub Total − Dead Cost Plus VIG − fees.
7. Calculate **Sales Commission** = Profit × Commission %.
8. Write **all** of these values back to the Zoho Books custom fields.

### When to use it
- After creating a new invoice that hasn't had its costs filled in yet.
- After line items or costs change on an existing invoice.
- To verify that the Dead Cost, Profit, and Commission fields are correct.

### Important
The VIG rate is pulled from the salesperson's settings. If you need to override it, update the rep's VIG in Admin  to  VIG Settings first.
    `,
  },
  {
    id: "salesorder-process-costs",
    title: "Processing Sales Order Costs & Commissions",
    category: "Sales Docs",
    content: `
### Process Costs on Sales Orders

Sales Orders support the same cost processing as Invoices. When viewing a **Sales Order** in the details modal, you can run **Process Costs** to calculate and write back all financial fields.

### What it calculates
1. **Dead Cost Total** -- sum of each line item's purchase cost × quantity.
2. **Dead Cost Subject to VIG** / **Dead Cost No VIG** -- split based on the "Subject to VIG" checkbox and gift status.
3. **Dead Cost Plus VIG** = (Subject to VIG × VIG Rate) + No VIG.
4. **Dead Profit Actual** -- Sub Total minus Dead Cost Total (raw margin before VIG and fees).
5. **Profit** = Sub Total − Dead Cost Plus VIG − CC Fees − Additional Costs − Insurance.
6. **Sales Commission** = Profit × Commission %.

All values are written to Zoho Books custom fields on the Sales Order.

### VIG rate lookup
The VIG rate follows the same priority as invoices:
1. Manual override passed in the request.
2. Existing "Salesperson VIG" custom field on the SO.
3. The salesperson's VIG settings (constant or monthly goal).
4. Fallback default of **1.3x**.

### Loop prevention
Each sales order has a 60-second cooldown after processing to prevent update loops from Zoho workflow callbacks.

### Local database
Cost data is also stored in the local Sales Order record for fast dashboard access.
    `,
  },
  {
    id: "quote-process-costs",
    title: "Processing Quote Costs & Commissions",
    category: "Sales Docs",
    content: `
### Process Costs on Quotes

Quotes (Estimates) support the same cost processing as Invoices and Sales Orders. When viewing a **Quote** in the details modal, you can run **Process Costs** to calculate and write back all financial fields.

### What it calculates
1. **Dead Cost Total** -- sum of each line item's purchase cost × quantity.
2. **Dead Cost Subject to VIG** / **Dead Cost No VIG** -- split based on the "Subject to VIG" checkbox and gift status.
3. **Dead Cost Plus VIG** = (Subject to VIG × VIG Rate) + No VIG.
4. **Dead Profit Actual** -- Sub Total minus Dead Cost Total (raw margin before VIG and fees).
5. **Profit** = Sub Total − Dead Cost Plus VIG − CC Fees − Additional Costs. Insurance is **company revenue** and is NOT deducted.
6. **Sales Commission** = Profit × Commission %.

All values are written to Zoho Books custom fields on the Estimate.

### Why process costs on a Quote?
- Preview profit margins **before** converting to a Sales Order or Invoice.
- Verify the deal is worth pursuing at the quoted price.
- Compare Dead Profit Actual (raw margin) against Profit (after VIG and fees) to understand the cost impact of VIG.

### VIG rate lookup
Same priority as invoices and sales orders: manual override  to  existing custom field  to  salesperson settings  to  **1.3x fallback**.

### Loop prevention
Each quote has a 60-second cooldown after processing to prevent update loops from Zoho workflow callbacks.

### Local database
Cost data is also stored in the local Quote record for fast dashboard access.
    `,
  },
  {
    id: "campaign-intel-panel",
    title: "Sales Call Campaign -- Account Intel Panel",
    category: "Sales Hub",
    content: `
### Account Intel Panel

When running a Sales Call Campaign, a **tabbed info panel** appears between the account card and the script:

- **📦 Purchases** -- full purchase history: Item Name, SKU, Qty Bought, Average Price, Total Spent. Auto-loaded from Zoho Books invoice line items.
- **📝 Notes** -- all notes for the account (author, date, sentiment badge, content). Gives you full context on previous interactions.
- **📊 Invoices** -- list of recent invoices with status badges (paid, overdue, sent) and amounts.

Data loads automatically as you cycle through accounts. Use this to quickly understand what the customer has bought before and what previous reps have noted.
    `,
  },
  {
    id: "commissions-calculation",
    title: "How Commissions Are Calculated",
    category: "Commissions",
    content: `
### Commission Source

Commissions are pulled directly from the **SALES COMMISSION** custom field in Zoho Books -- the system does NOT calculate commission on its own.

To ensure your commission shows correctly:
1. Run **Process Costs** on the invoice (from the invoice details modal) to calculate and write the SALES COMMISSION field.
2. Commission = 50% of Profit (by default), where Profit = Sub Total - Dead Cost Plus VIG - CC Fees - Additional Costs. Insurance is **company revenue** and is NOT deducted.

### Split Timing
- **Upfront (50%)** -- credited when the invoice is created.
- **Final (50%)** -- credited when the invoice is marked as paid.

If an invoice has no SALES COMMISSION field set in Zoho Books, it will show as $0 commission until processed.
    `,
  },
  {
    id: "timeclock-how-it-works",
    title: "How the Timeclock Works",
    category: "Timeclock",
    content: `
### Automatic Tracking

The timeclock tracks your activity automatically while you're using the Sales Portal. It pings every 5 minutes to record your presence.

### Key Behaviors
- **Clock In**: Click the Clock In button in the top bar. Activity tracking starts immediately.
- **Clock Out**: Click Clock Out, or the system auto-clocks you out after **20 minutes of inactivity** at your **last activity time** (no idle time is counted).
- **Inactivity**: If you're away for 20+ minutes and come back, that gap is recorded as an inactivity period and subtracted from your hours.
- **Hours Display**: Both the top bar and the timeclock page show hours with inactivity subtracted.

### Time Zones
All dates are stored in **Phoenix time (MST)** -- no daylight saving time changes.

### Requesting Changes
If you forgot to clock in/out or need a correction, use the **Request Change** button on the Timeclock page.
    `,
  },
  {
    id: "user-management",
    title: "Adding & Managing Users",
    category: "Admin",
    content: `
### Adding New Users
1. Go to **Admin  to  User Permissions**
2. Click **Add User** in the top-right
3. Fill in their name, email (must match their Zoho login email), role, and optionally their Zoho User ID
4. Once created, the user can log in via Zoho OAuth

### How User Sync Works
- **First Login**: When a new user logs in via Zoho OAuth, the system creates or merges their account automatically.
- **Account Owner Sync**: When accounts are synced from Zoho CRM, if an account owner doesn't exist in the portal yet, a "stub" user is created. When that person logs in via Zoho, their stub is automatically merged -- their real name and email replace the placeholder.
- **No duplicates**: The system checks both Zoho User ID and email to prevent duplicate user records.

### User Roles
- **Sales Representative**: Can view their assigned accounts, log calls, manage tasks
- **Admin**: Full access to all accounts, admin tools, user management, and campaigns

### Bulk Account Assignment
1. Go to **Admin  to  User Permissions**
2. Expand a user and click **Assign Accounts**
3. Search and select accounts to reassign to that user
4. Click **Reassign** -- this updates both the local database and Zoho CRM

### Sales Board Permission
The Sales Board tab on the dashboard is a permission-gated feature. It is **not** available to reps by default. To grant access, go to Admin  to  User Permissions  to  expand the user  to  enable "Sales Board" under Page Access.

### Show on Sales Board
Each user has a **"Show on Sales Board"** toggle in Admin  to  User Permissions. When enabled, that user appears as a tracked rep on the live Sales Board display. The Sales Board dynamically loads users with this flag -- no hardcoded rep list.
    `,
  },
  {
    id: "admin-data-sync",
    title: "Data Sync & Account Enrichment",
    category: "Admin & Management",
    content: `
### Account Data Source: Zoho Books
All account data (addresses, phone numbers, invoices, sales orders, quotes) is synced from **Zoho Books** -- not CRM. Since CRM and Books are already synced in Zoho, Books is the single source of truth.

### Admin Bulk Sync
Go to **Admin  to  Data Sync** to sync data from Zoho Books:
- **Sync Accounts** -- Updates account IDs and caches address info from Books contacts
- **Sync Invoices** -- Pulls **all invoices for all assigned accounts** and links them to accounts. Sales reps now see every invoice on accounts assigned to them, regardless of who created the invoice in Zoho -- not just invoices they personally own.
- **Sync Sales Orders** -- Pulls all sales orders
- **Sync Quotes** -- Pulls all estimates/quotes
- **⚡ Sync All** -- Runs all syncs in order (accounts first)

### Address Info
Account addresses (billing + shipping) are fetched from **Zoho Books contacts** and cached in the database. When you view an account, the address loads from the cache. If it's missing, it's fetched live from Books and cached automatically.

### Campaign Modal Enhancements
The **Sales Outreach Campaign** has been redesigned as a **full-screen 3-panel dialer**:

#### Left Panel -- Account Queue
- Scrollable list of all accounts in the campaign (expanded info treatment with width 'w-80')
- Active account highlighted with cyan glow; completed accounts dimmed
- Status dots: green (active), red (overdue invoices), grey (done)
- Click any account to jump to it instantly
- **Expanded Information Cards**:
  - Displays primary contact name and direct phone number inline.
  - Financial summary showing Lifetime Value (LTV) and Overdue Balance badges.
  - Geographic context showing account billing location (city/state) and active Timezone indicator.
  - Color-coded Quality badges (e.g. HOT) for rapid lead prioritization.

#### Center Panel -- Dialer + Script + Close
- **Sticky Account HUD** (always visible while scrolling): Contact name, company, phone (ZDialer text), email, address, Call/SMS/Email buttons, KPI chips (LTV, Units, Overdue), top 3 products inline, fact-finding summary chips, and an **inline Call Outcome Logging Bar** (Reached toggle, Spoke With, Outcome select, Follow-up date, Notes input, and Skip / Log & Next buttons) to log calls dynamically without scrolling.
- **Outreach Script + Fact-Finding**: Cold Call / Follow-Up toggle. On Cold Call, each of the 7 fact-finding questions appears inline with its form (pill selectors, text inputs) directly below the question text. A progress tracker (7 dots) shows completion. On Follow-Up, the generated script shows first, followed by any missing fact-finding fields.
- **Blade Pitch Recommendations**: Good  to  Better  to  Best with full pricing and free blade promotions
- **Order Builder**: Search any product from catalog with live search dropdown, or quick-add the top 10 selling blades (pulled dynamically from Zoho Books catalog by product name) with one tap. Each line item has paid qty, free qty (green), editable unit price, and auto-calculated line total. Financial estimates are calculated in real-time: Dead Cost (purchase cost × all items), Dead Profit (revenue − dead cost), Profit after VIG (using 1.3× multiplier on paid items, 1× on free/gift items), Sales Commission estimate (50% of profit), and margin %. "Preview Sales Order" button opens a mock sales order that separates paid items and free/gift items into distinct line item sections with customer info, order totals, and a full profit breakdown panel. Order data is saved with the call log.
- **Sales Close Script**: 4-step close (Verify Address  to  Payment  to  Email  to  Final Close)

#### Right Panel -- Account Intelligence
- **Profile**: Billing address, shipping address, industry, tags, owner, website
- **Product LTV**: Per-product lifetime value cards with visual spend bars, total LTV badge, avg cost per unit, and account-wide summary KPIs
- **Deals**: Active deals with stage, amount, closing date
- **Invoices**: All invoices with status badges (paid/overdue/other)
- **Sales Orders**: SO number, status, amount
- **Notes/Call Log**: Previous notes with author, sentiment, date
- **Fact-Finding (Unified)**: Collapsible editable form that doubles as the saved profile -- shows compact summary when collapsed, full pill-selectable form when expanded. Data is pre-filled from account records and saved on call log.

### Phone Numbers & ZDialer
Phone numbers are displayed as plain text (not tel: links) so Zoho ZDialer can detect and handle click-to-call. The "Call" button copies the number to clipboard for ZDialer use.

### Call List: Contact Fallback for Accounts with No Primary Phone
When the **Call List** mode is active and an account row has no phone number tied to it (no ZDialer link can be generated), the top 2 contacts associated with that account are displayed inline within the row so reps can still act on the lead:
- **Left side (under account name):** A compact contact sub-list appears with each contact's name and phone number (clickable tel: link) or email as a fallback.
- **Middle column (desktop):** The same contacts appear right-aligned below the "Last Called" and LTV stats, separated by a subtle border.
- **Phone action button:** Instead of a dimmed/disabled phone icon, a red "No #" badge is shown in call list mode so the rep instantly knows the number is missing.
- Contact phones resolve in order: contact.phone, then contact.mobilePhone, then email as a text fallback.

### Sales Close Script
After the blade pitch recommendations, the campaign dialer includes a **Move to Close** section with 4 scripted steps:
1. **Verify Shipping Address** -- reads back the customer's address on file (auto-populated from Zoho Books)
2. **Take Payment** -- "What's easiest for you -- do you want us to bill you later, or do you wanna throw this on a card and get it out of the way?" with card details or Net 30 alternative
3. **Confirm Email** -- reads back the email on file or asks for one (for receipts and tracking)
4. **Final Close** -- relationship-building wrap-up and confirmation of shipping timeline

The blade pitches now include the **full pricing, free blade promotion, and close transition** from the actual sales scripts.
    `,
  },
  // ------------------------------- ADMIN & MANAGEMENT -------------------------------
  {
    id: "admin-fact-finding",
    title: "Fact-Finding on Account Pages",
    category: "Admin & Management",
    content: `
### Fact-Finding Questions

Every account has 7 fact-finding fields that capture key information about the customer's blade usage. You can view and edit these from the **Account page  to  Overview tab  to  Business Profile** section.

### Editing Fact-Finding Data
1. Navigate to any account page
2. Click the **Edit** button in the header
3. Scroll to the **📋 Fact-Finding** section
4. Click pills to select/deselect answers for each question:
   - **Blade Sizes** -- what size blades they run (10"-36")
   - **Materials Cut** -- what they're cutting (Concrete, Asphalt, Brick, etc.)
   - **Current Supplier** -- where they buy blades (Home Depot, Sunbelt, etc.)
   - **Avg Blade Cost** -- how much they pay per blade
   - **Crew Count** -- how many crews they have
   - **Blades Per Order** -- how many blades they buy at a time
   - **Improvement Priority** -- what matters most (Longer life, Faster cutting, etc.)

### Where Fact-Finding Gets Captured
- **Campaign Dialer** -- automatically asked during sales calls and saved when the call is logged
- **Account Edit Modal** -- manually editable at any time
- Existing answers are never overwritten unless you change them

### Business Profile Display
The Business Profile section on the account Overview tab **always appears** -- even if no data has been collected yet. Fields without data show "Not recorded" in muted text so you can see what's missing at a glance.
    `,
  },
  {
    id: "admin-do-not-call",
    title: "Do Not Call (DNC) Filtering",
    category: "Admin & Management",
    content: `
### How Do Not Call Works

Accounts can be marked as **🚫 DO NOT CALL** using the Quality Picker on any account page. Once marked, they are **hidden by default** from all lists across the portal.

### Where DNC Filtering Applies
- **Dashboard / Sales Hub** -- DNC accounts are hidden from all effort modes (Sales, Call List, Cold Call)
- **Update Accounts** -- DNC accounts are hidden from the admin account management list
- **Collections** -- DNC accounts are filtered out of overdue invoice lists

### How to Include DNC Accounts
Every page that filters DNC accounts has an **"Include Do Not Call"** checkbox in the filter area. Check it to temporarily show those accounts alongside regular ones.

### Setting DNC Status
1. Go to any account page
2. Use the **Quality Picker** dropdown (top of the page, near the account name)
3. Select **🚫 DO NOT CALL**

The account will immediately be hidden from all lists until you check the "Include Do Not Call" filter checkbox.

### Important Notes
- DNC status is **never auto-changed** by the system -- it's a manual override that sticks
- The Zoho sync will not downgrade or change DNC status
- You can always find DNC accounts by checking the filter checkbox or searching by name
    `,
  },
  {
    id: "dead-profit-cost-processing",
    title: "Dead Profit & Unified Cost Processing",
    category: "Admin & Management",
    content: `
### What is Dead Profit?

**Dead Profit Actual** is the simplest profit measure: **Subtotal minus Dead Cost Total** (all raw purchase costs, no VIG multiplier applied, includes ALL items -- gift items, no-VIG items, everything).

This is different from the calculated **Profit** field:
- **Dead Profit** = Subtotal − Dead Cost Total (raw margin)
- **Profit** = Subtotal - Dead Cost Plus VIG - CC Fees - Additional Costs (net margin after all deductions). Insurance is **company revenue** and is NOT included in this deduction.

### Where Dead Profit is Calculated

Dead Profit (field: \`cf_dead_profit_actual\`) is calculated on:
- **Invoices** -- via the Process Invoice Costs function
- **Sales Orders** -- via the Process Sales Order Costs function  
- **Quotes** -- via the Process Quote Costs function

### Bulk Processing (Zoho Books Scripts page)

The **Zoho Books Scripts** page (Admin  to  Zoho Books Scripts) has a "Bulk Process Document Costs" section that:
1. Select document type: **Invoices**, **Sales Orders**, or **Quotes**
2. Select filter: **Unpaid Only**, **Last 90 Days**, or **All**
3. Click the button to process all matching documents page by page

Each document gets:
- Dead Cost Total, Dead Cost Subject to VIG, Dead Cost No VIG
- Dead Profit Actual (Subtotal − Dead Cost Total)
- VIG Rate, Dead Cost Plus VIG
- Profit, Margin %, Commission, Sales Commission
- All values written back to Zoho Books custom fields

### Important Notes
- This app is the **single source of truth** for cost calculations -- Zoho Books automations are turned off
- Only changed fields are written to Zoho (prevents unnecessary API calls)
- The system includes a loop guard to prevent re-processing within 60 seconds
    `,
  },
  {
    id: "task-hub-dashboard",
    title: "Task Hub -- Dashboard & Calendar",
    category: "Sales & Orders",
    content: `
### What Is the Task Hub?

The Task Hub (/tasks) is the central workspace for managing all tasks across the team. It replaces the task sidebar on the main dashboard with a full-featured management environment.

### Task Categories

Tasks are automatically sorted into 3 categories based on their type:

**Communication** (blue) -- Calls, Emails, Texts
- Any task of type Call, Email, or Text
- These are customer-facing interaction tasks

**Sales** (green) -- Account & Deal Tasks
- Tasks of type "Task" that are linked to an account or deal
- Used to track sales follow-ups, quotes, and deal progress

**Office & Process** (amber) -- Internal Tasks
- Tasks of type "Processing" or unlinked general tasks
- Used for back-office work, order processing, and admin

### Dashboard View

The default view shows **three columns** (one per category) so you can see all task types at a glance.

- Each card shows: type badge, priority, status, title, description, linked assets (account/deal/invoice/SO/quote chips), assignee, due date
- **Overdue tasks** are highlighted in red
- Use the **category tabs** to filter to a single lane
- Use the search bar, status filter, type filter, and sort to narrow results

### Adding an Outcome / Update

On any task card, hover to reveal the action buttons. Click the **speech bubble icon** to add an outcome note.

Outcomes are timestamped and appended to the task description: e.g. [Outcome Jul 14 5:30pm]: Spoke with customer...

You can also add outcomes from the **Task Detail Panel** (click any task title to open it).

### Task Detail Panel

Clicking a task title opens a slide-in panel with:
- Editable subject, status, and priority
- All connected assets (account link, deal, invoice, SO, quote)
- Full notes/description editor
- Outcomes history with ability to add new ones
- Save Changes and Complete buttons

### Calendar View

Switch to the Calendar using the Dashboard/Calendar toggle at the top right.

**4 views:**
- **Day** -- All tasks due that day in a single pane
- **Week** -- 7-column layout with tasks placed in their day
- **Month** -- Grid with task chips on each day; click a day to drill into Day view
- **Year** -- 12-month heatmap; days with tasks are highlighted, red = high priority

Use the **category filter chips** in the Calendar view to show/hide categories.

### Quick Actions (on every task card)

- **Edit icon** -- Change status inline (dropdown)
- **Speech bubble** -- Add outcome / update note
- **Check icon** -- Mark as Complete

### Creating a New Task

Click **+ New Task** in the header to go to the task creation form. You can also use the global top bar quick-add button.

### Syncing With Zoho

Tasks are synced from Zoho CRM. Click the **refresh icon** (↺) to force a fresh sync from Zoho for the latest tasks.
    `,
  },

  // ------------------------------- TOOLS & RESOURCES -------------------------------
  {
    id: "tools-fact-finding-panel",
    title: "Fact-Finding: The Smart Question System",
    category: "Tools & Resources",
    content: `
The **Fact-Finding Panel** is a shared component that appears in multiple places across the app. It standardizes how we capture customer profile data during every interaction.

### Where it appears
- **Titan Dialer (Campaign Modal)** -- Cold call flow and Follow-up flow both use the same 7 core questions
- **Account Edit Modal** -- "Profile Data" section for updating known answers
- **Account Slideout** -- Read-only summary chips showing what we already know

### The 7 Core Questions
| # | Field | What to ask |
|---|-------|-------------|
| 1 | **Blade Sizes** | "First off, what size blades do you run? 14"?" |
| 2 | **Materials Cut** | "What are you guys cutting out there?" |
| 3 | **Current Supplier** | "Where do you pick up your blades now -- retail or wholesale?" |
| 4 | **Avg Blade Cost** | "How much are they charging you for a good 14" blade?" |
| 5 | **Crew Count** | "How many crews do you have?" |
| 6 | **Blades Per Order** | "How many blades do you normally pick up at a time?" |
| 7 | **Improvement Priority** | "If you could improve one thing about your current blades, what would it be?" |

### How the collapsible cards work
- **Unanswered** -- card is open and shows the full script question + pill options to tap
- **Answered** -- card collapses to a compact chip showing the answer; tap to expand and change it
- **Progress bar** at the bottom tracks how many of 7 questions are answered

### Answers carry over
Once you fill in fact-finding answers during a call, they are saved to the account record. The next rep who calls that account will see the answers already pre-populated so you never ask the same question twice.

### Cold Call vs. Follow-Up phrasing
The same questions use slightly different wording:
- **Cold call mode** (cyan): "First off, what size blades do you run?" 
- **Follow-up mode** (amber): "What size blades are you running?"
    `,
  },
  {
    id: "tools-cost-processing",
    title: "Cost Processing & Profit Calculation",
    category: "Tools & Resources",
    content: `
The app automatically calculates profit and commissions on every invoice, quote, and sales order using a standardized formula.

### The Formula
\`\`\`
Dead Cost  = sum of (line item cost × quantity)
VIG        = Dead Cost × VIG Rate (default: 1.30 = 30% markup)
Revenue    = sum of (line item price × quantity)
Gross Profit = Revenue - VIG
Commission = Gross Profit × 50%
\`\`\`

### VIG Rate
The default VIG rate is **1.3 (30%)**. This represents the true cost including overhead, handling, and margin to the company. Admins can override VIG per document.

### Insurance money
Insurance reimbursements and insurance-funded payments do **not** affect commission or profit calculations. They are tracked separately and excluded.

### Where costs are processed
Three dedicated Netlify functions handle cost processing:
- \`/api/process-invoice-costs\` -- for Invoices
- \`/api/process-quote-costs\` -- for Quotes
- \`/api/process-salesorder-costs\` -- for Sales Orders

All three use the same shared \`cost-calculations.ts\` library to ensure consistency.

### Who can see cost breakdowns
Only users with the \`viewCostBreakdown\` permission can see dead cost, VIG, and margin. Reps without this permission see only their commission amount.
    `,
  },
  {
    id: "tools-permissions",
    title: "User Permissions Reference",
    category: "Admin & Management",
    content: `
Each user account has a set of permissions that control what they can see and do. Admins assign permissions through the user management screen.

### Permission Keys
| Permission | What it controls |
|-----------|-----------------|
| \`viewAllReps\` | See all reps' accounts, not just assigned ones |
| \`viewCostBreakdown\` | See dead cost, VIG, and margin on documents |
| \`viewCommissions\` | See commission dollar amounts |
| \`processCosts\` | Trigger cost recalculation on documents |
| \`logCalls\` | Access call logging modals |
| \`manageVisibility\` | Access the admin visibility config panel |
| \`editAccounts\` | Edit account details |
| \`processPayments\` | Record payments on invoices |
| \`voidDocuments\` | Void invoices, quotes, and sales orders |
| \`convertDocuments\` | Convert quotes  to  SO  to  Invoice |
| \`manageUsers\` | Add/edit/deactivate user accounts |
| \`isAdmin\` | Full access override -- all permissions enabled |

### Sales Rep vs. Admin
- **Sales Reps** see only their assigned accounts by default. They can log calls, view their own commissions, and create orders for their accounts.
- **Admins** have full access to all accounts, cost data, user management, and configuration panels.

### Visible Reps list
Admins can configure which reps appear in dropdowns system-wide using the "Visible Reps" setting in the update config. Reps not in this list are hidden from assignment dropdowns.
    `,
  },
  {
    id: "zoho-books-scripts",
    title: "Zoho Books Scripts",
    category: "Admin & Management",
    content: `
### Bulk Processing (Zoho Books Scripts page)

The **Zoho Books Scripts** page (Admin  to  Zoho Books Scripts) has a Bulk Process Document Costs section that lets you:
1. Select document type: Invoices, Sales Orders, or Quotes
2. Select filter: Unpaid Only, Last 90 Days, or All
3. Click the button to process all matching documents page by page

Each document gets:
- Dead Cost Total, Dead Cost Subject to VIG, Dead Cost No VIG
- Dead Profit Actual (Subtotal minus Dead Cost Total)
- VIG Rate, Dead Cost Plus VIG
- Profit, Margin %, Commission, Sales Commission
- All values written back to Zoho Books custom fields

### Important Notes
- This app is the single source of truth for cost calculations -- Zoho Books automations are turned off
- Only changed fields are written to Zoho (prevents unnecessary API calls)
- The system includes a loop guard to prevent re-processing within 60 seconds
    `,
  },

  {
    id: "task-hub-dashboard",
    title: "Task Hub -- Dashboard & Calendar",
    category: "Sales & Orders",
    content: `
### What Is the Task Hub?

The Task Hub (/tasks) is the central workspace for managing all tasks across the team. It replaces the task sidebar on the main dashboard with a full-featured management environment.

### Task Categories

Tasks are automatically sorted into 3 categories based on their type:

**Communication** (blue) -- Calls, Emails, Texts
- Any task of type Call, Email, or Text
- These are customer-facing interaction tasks

**Sales** (green) -- Account & Deal Tasks
- Tasks of type "Task" that are linked to an account or deal
- Used to track sales follow-ups, quotes, and deal progress

**Office & Process** (amber) -- Internal Tasks
- Tasks of type "Processing" or unlinked general tasks
- Used for back-office work, order processing, and admin

### Dashboard View

The default view shows **three columns** (one per category) so you can see all task types at a glance.

- Each card shows: type badge, priority, status, title, description, linked assets (account/deal/invoice/SO/quote chips), assignee, due date
- **Overdue tasks** are highlighted in red
- Use the **category tabs** to filter to a single lane
- Use the search bar, status filter, type filter, and sort to narrow results

### Adding an Outcome / Update

On any task card, hover to reveal the action buttons. Click the **speech bubble icon** to add an outcome note.

Outcomes are timestamped and appended to the task description: e.g. [Outcome Jul 14 5:30pm]: Spoke with customer...

You can also add outcomes from the **Task Detail Panel** (click any task title to open it).

### Task Detail Panel

Clicking a task title opens a slide-in panel with:
- Editable subject, status, and priority
- All connected assets (account link, deal, invoice, SO, quote)
- Full notes/description editor
- Outcomes history with ability to add new ones
- Save Changes and Complete buttons

### Calendar View

Switch to the Calendar using the Dashboard/Calendar toggle at the top right.

**4 views:**
- **Day** -- All tasks due that day in a single pane
- **Week** -- 7-column layout with tasks placed in their day
- **Month** -- Grid with task chips on each day; click a day to drill into Day view
- **Year** -- 12-month heatmap; days with tasks are highlighted, red = high priority

Use the **category filter chips** in the Calendar view to show/hide categories.

### Quick Actions (on every task card)

- **Edit icon** -- Change status inline (dropdown)
- **Speech bubble** -- Add outcome / update note
- **Check icon** -- Mark as Complete

### Creating a New Task

Click **+ New Task** in the header to go to the task creation form. You can also use the global top bar quick-add button.

### Syncing With Zoho

Tasks are synced from Zoho CRM. Click the **refresh icon** (↺) to force a fresh sync from Zoho for the latest tasks.
    `,
  },

  // ------------------------------- TOOLS & RESOURCES -------------------------------
  {
    id: "tools-fact-finding-panel",
    title: "Fact-Finding: The Smart Question System",
    category: "Tools & Resources",
    content: `
The **Fact-Finding Panel** is a shared component that appears in multiple places across the app. It standardizes how we capture customer profile data during every interaction.

### Where it appears
- **Titan Dialer (Campaign Modal)** -- Cold call flow and Follow-up flow both use the same 7 core questions
- **Account Edit Modal** -- "Profile Data" section for updating known answers
- **Account Slideout** -- Read-only summary chips showing what we already know

### The 7 Core Questions
| # | Field | What to ask |
|---|-------|-------------|
| 1 | **Blade Sizes** | "First off, what size blades do you run? 14"?" |
| 2 | **Materials Cut** | "What are you guys cutting out there?" |
| 3 | **Current Supplier** | "Where do you pick up your blades now -- retail or wholesale?" |
| 4 | **Avg Blade Cost** | "How much are they charging you for a good 14" blade?" |
| 5 | **Crew Count** | "How many crews do you have?" |
| 6 | **Blades Per Order** | "How many blades do you normally pick up at a time?" |
| 7 | **Improvement Priority** | "If you could improve one thing about your current blades, what would it be?" |

### How the collapsible cards work
- **Unanswered** -- card is open and shows the full script question + pill options to tap
- **Answered** -- card collapses to a compact chip showing the answer; tap to expand and change it
- **Progress bar** at the bottom tracks how many of 7 questions are answered

### Answers carry over
Once you fill in fact-finding answers during a call, they are saved to the account record. The next rep who calls that account will see the answers already pre-populated so you never ask the same question twice.

### Cold Call vs. Follow-Up phrasing
The same questions use slightly different wording:
- **Cold call mode** (cyan): "First off, what size blades do you run?" 
- **Follow-up mode** (amber): "What size blades are you running?"
    `,
  },
  {
    id: "tools-cost-processing",
    title: "Cost Processing & Profit Calculation",
    category: "Tools & Resources",
    content: `
The app automatically calculates profit and commissions on every invoice, quote, and sales order using a standardized formula.

### The Formula
\`\`\`
Dead Cost  = sum of (line item cost × quantity)
VIG        = Dead Cost × VIG Rate (default: 1.30 = 30% markup)
Revenue    = sum of (line item price × quantity)
Gross Profit = Revenue - VIG
Commission = Gross Profit × 50%
\`\`\`

### VIG Rate
The default VIG rate is **1.3 (30%)**. This represents the true cost including overhead, handling, and margin to the company. Admins can override VIG per document.

### Insurance money
Insurance reimbursements and insurance-funded payments do **not** affect commission or profit calculations. They are tracked separately and excluded.

### Where costs are processed
Three dedicated Netlify functions handle cost processing:
- \`/api/process-invoice-costs\` -- for Invoices
- \`/api/process-quote-costs\` -- for Quotes
- \`/api/process-salesorder-costs\` -- for Sales Orders

All three use the same shared \`cost-calculations.ts\` library to ensure consistency.

### Who can see cost breakdowns
Only users with the \`viewCostBreakdown\` permission can see dead cost, VIG, and margin. Reps without this permission see only their commission amount.
    `,
  },
  {
    id: "tools-permissions",
    title: "User Permissions Reference",
    category: "Admin & Management",
    content: `
Each user account has a set of permissions that control what they can see and do. Admins assign permissions through the user management screen.

### Permission Keys
| Permission | What it controls |
|-----------|-----------------|
| \`viewAllReps\` | See all reps' accounts, not just assigned ones |
| \`viewCostBreakdown\` | See dead cost, VIG, and margin on documents |
| \`viewCommissions\` | See commission dollar amounts |
| \`processCosts\` | Trigger cost recalculation on documents |
| \`logCalls\` | Access call logging modals |
| \`manageVisibility\` | Access the admin visibility config panel |
| \`editAccounts\` | Edit account details |
| \`processPayments\` | Record payments on invoices |
| \`voidDocuments\` | Void invoices, quotes, and sales orders |
| \`convertDocuments\` | Convert quotes  to  SO  to  Invoice |
| \`manageUsers\` | Add/edit/deactivate user accounts |
| \`isAdmin\` | Full access override -- all permissions enabled |

### Sales Rep vs. Admin
- **Sales Reps** see only their assigned accounts by default. They can log calls, view their own commissions, and create orders for their accounts.
- **Admins** have full access to all accounts, cost data, user management, and configuration panels.

### Visible Reps list
Admins can configure which reps appear in dropdowns system-wide using the "Visible Reps" setting in the update config. Reps not in this list are hidden from assignment dropdowns.
    `,
  },
  {
    id: "admin-bulk-cost-calculation",
    title: "Bulk Cost Calculation & Zoho Sync",
    category: "Admin & Management",
    content: `
The **Bulk Cost Calculation** system lets admins calculate commission and profit data for ALL documents at once and queue the results to be pushed to Zoho Books automatically.

### Two-Phase Process

**Phase 1 -- Calculate (bulk-calculate-costs)**
Scans every Invoice, Quote, and Sales Order in the database, fetches full details from Zoho Books, and runs the profit/commission formula on each document. Results are stored locally in the database.

**Phase 2 -- Sync (sync-costs-to-zoho)**
Reads all documents with pending calculated values and pushes them to Zoho Books custom fields via PUT request. Marks each document as synced when complete.

### Overlap Prevention (3 Layers)

| Layer | How It Works |
|-------|-------------|
| **Run Lock** | A \`SystemSetting\` key \`cost_calc_running\` prevents two bulk runs from starting at the same time. Auto-expires after 30 minutes. |
| **Doc-Level Check** | Each document's \`costsCalculatedAt\` timestamp is compared to \`zohoModifiedTime\`. If the doc hasn't changed since last calculation, it's skipped automatically. |
| **Field-Level Diff** | Only fields whose calculated value actually differs from what's already in Zoho are included in the PUT payload. Documents with no changed fields are skipped. |

### POST Parameters for bulk-calculate-costs

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| \`docTypes\` | string[] | all | Which types: \`invoices\`, \`quotes\`, \`salesorders\` |
| \`force\` | boolean | false | Recalculate even if doc is current |
| \`dryRun\` | boolean | false | Calculate but don't write to DB |
| \`limit\` | number | none | Cap total docs per type (for testing) |
| \`batchDelay\` | number | 600 | ms delay between batches of 10 |

### POST Parameters for sync-costs-to-zoho

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| \`docTypes\` | string[] | all | Which types to sync |
| \`dryRun\` | boolean | false | Log what would be pushed without PUTting |
| \`batchDelay\` | number | 1000 | ms delay between batches |

### API Endpoints

- \`GET /api/bulk-calculate-costs\` -- shows lock status and pending counts
- \`POST /api/bulk-calculate-costs\` -- trigger calculation run
- \`GET /api/sync-costs-to-zoho\` -- shows pending sync counts and last sync times
- \`POST /api/sync-costs-to-zoho\` -- push all pending values to Zoho Books

### What Gets Calculated

All documents get these fields populated in Zoho Books custom fields:
- **Dead Cost Total** -- sum of all line item costs
- **Dead Cost Subject to VIG** -- cost of items that go through VIG markup
- **Dead Cost No VIG** -- cost of items exempt from markup (gifts, no-VIG items)
- **Salesperson VIG** -- the VIG multiplier used (per-rep from DB or default 1.3)
- **Dead Cost Plus VIG** -- the true cost after markup
- **Profit** -- SubTotal − DeadCostPlusVIG − CC Fees − Additional Costs
- **Commission From Profit %** -- commission rate (default 50%)
- **Sales Commission** -- dollar amount of commission earned
- **Items DC Breakdown** -- per-line-item cost detail string
- **Paid In Full Date** -- auto-set when invoice is paid (invoices only)
    `,
  },
  {
    id: "comms-zdialer-setup",
    title: "ZDialer Mobile Extension Setup",
    category: "Communication",
    content: `
  The **ZDialer** extension seamlessly connects the Sales Portal on your mobile device to Zoho Voice, ensuring call 
  recordings, sentiment analysis, and AI summaries are captured correctly.

  ### Setup Instructions
  1. Download the **ZDialer App** from your device's app store (iOS/Android).
  2. Log in using your Zoho credentials.
  3. Go to **Settings** in the app and ensure it is set as your default calling application if prompted.
  4. In the Sales Portal, when browsing an Account or the Sales Hub on your mobile device, clicking any phone number will now automatically open ZDialer.

  ### Desktop Usage
  On desktop, clicking a phone number will use your computer's default calling application (like FaceTime or a softphone) using standard \`tel:\` links, but you can also install the ZDialer Chrome extension for web integration.
      `,
    },
  {
    id: "comms-account-center",
    title: "AI & Communications Center (Account Page)",
    category: "Communication",
    content: `
The **AI & Comm Center** tab on every Account page is the full-featured sales command center with the same capabilities as the Titan Dialer used during call campaigns.

### Channel Tabs
- **Call** -- Click-to-Dial, call outcome, follow-up reminder, and a 7-panel workflow
- **SMS** -- Chat bubble interface with outbound number selection
- **Email** -- Compose and log emails with template support
- **WhatsApp** -- Compose and log WhatsApp messages with template support

### Call Sub-Tabs (7 panels inside the Call tab)
1. **Log** -- Pick call outcome, enter who you spoke with, set a follow-up date, write notes, and click Save
2. **Script** -- One-click personalized script generation. Toggle Cold Call or Follow-Up mode. Adapts to purchase history, overdue invoices, and missing Fact-Finding data
3. **Fact-Finding** -- 11-field survey: blade sizes, materials cut, current supplier, avg blade cost, crew count, blades per order, improvement priority, ready to buy, job types, pain points, product interest
4. **Products** -- Blade recommendations (Good/Better/Best tiers) based on materials cut and improvement priority, each with a full scripted pitch and Copy button
5. **Intel** -- Purchase history, call notes, and invoice list with overdue invoices highlighted in red
6. **Order** -- Build a live order: product search, paid qty, free qty per line. Shows sub-total, dead cost plus VIG (1.3x), profit, margin %, and your commission (50% of profit after VIG)
7. **AI** -- Generate custom SMS, Email, WhatsApp, or Script content. Results auto-routable to the SMS or Email tab

### How it saves
Clicking Save Note and Log Call sends all data including outcome, notes, Fact-Finding answers, and order lines to the account record and logs the activity in the CRM.
    `,
  },
  {
    id: "itemized-costs-commission",
    title: "Itemized Costs & Commission on Documents",
    category: "Finance",
    content: `
## Itemized Cost & Commission Display

Every Invoice, Sales Order, and Quote/Estimate now shows a full cost and commission breakdown in the **Document Details Modal**.

### How to Access
Open any document (invoice, sales order, or estimate) from an account page or the Collections view. The left-side **Data View** panel shows:

### Cost & Commission Summary Card
Appears automatically if the document has been cost-processed. Shows:
- **Dead Cost Total** -- raw sum of all line item purchase costs
- **Dead Cost + VIG** -- dead cost after applying the salesperson's VIG multiplier
- **Profit** -- Sub Total minus Dead Cost Plus VIG minus any CC/insurance fees, shown with margin %
- **Commission** -- dollar amount earned (profit × commission %, default 50%), shown with percentage
- **VIG Rate** -- the multiplier applied (default 1.3×)

### Per-Item Cost Breakdown Table
Shows a grid table of every line item with columns:
- **Item** -- product name and SKU
- **Qty** -- quantity ordered
- **Rate** -- sell price per unit
- **Dead Cost** -- purchase cost for this line (amber)
- **VIG-DC** -- VIG-adjusted cost for this line (emerald, or "No VIG" badge for exempt items)
- **Flags** -- NV badge (No VIG) or GIFT badge for special items

The table totals row shows combined Dead Cost and VIG-DC totals.

### Process Costs Button
Available on **all three document types** (previously Invoice only). Click **Process Costs** in the top action bar to:
1. Fetch live line item data from Zoho Books (including purchase_rate per item)
2. Apply the dead cost formula with the rep's VIG rate
3. Calculate profit and commission
4. Write results back to Zoho Books custom fields
5. Save itemized data (lineItemDetails) to the local database for instant display on next open
6. Show the results immediately inline in the Cost & Commission Summary Card -- no page reload needed

### Zoho Books Line Items
Below the cost breakdown, the raw Zoho Books line items are displayed with:
- Item name, SKU, sell price (rate)
- Purchase cost per unit (purchase_rate -- the actual Zoho Books field name)
- Quantity

### Data Persistence
After running Process Costs, the results are stored in the document's \`items\` JSON blob:
- Aggregate fields: \`deadCostTotal\`, \`deadCostPlusVig\`, \`profit\`, \`commission\`, \`vigRate\`, etc.
- Per-item array: \`lineItemDetails\` -- each entry has \`{name, sku, quantity, rate, deadCost, noVig, gift}\`
This means the cost breakdown loads instantly on the next open without re-processing.
    `,
  },
]

// Keep the first canonical module for each stable ID. Historical content
// merges introduced repeated blocks; filtering here prevents duplicate menu
// entries and React key collisions while preserving the canonical copy.
export const trainingModules = rawTrainingModules.filter(
  (module, index, modules) => modules.findIndex(candidate => candidate.id === module.id) === index,
)
