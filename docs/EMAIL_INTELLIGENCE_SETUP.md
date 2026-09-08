# Email Intelligence Setup Checklist

The first release is read-only and approval-gated. It reads Microsoft 365 Inbox
and Sent Items, stores message/attachment metadata, extracts operational events,
matches them to local records, and places every proposed event in the Admin
review queue. Approval currently records the decision only; it does not mutate
an invoice, sales order, purchase order, package, payment, address, return, or
credit.

## Required from Titan Diamond

1. Microsoft 365 administrator contact
   - Name and email of the person who can create an Entra application.
   - They must be able to grant tenant-wide administrator consent.
   - Where: [Microsoft 365 Admin Center](https://admin.microsoft.com/) → Users → Active users.

2. Mailboxes and user assignments
   - Primary mailbox: `ben@titandiamond.net`.
   - Each rep may optionally enable their own portal-email mailbox in User Settings.
   - An administrator must assign additional or shared mailboxes; this prevents a rep from claiming another employee's mailbox under the tenant-wide Graph permission.
   - One user may have multiple mailboxes; a shared mailbox may be left
     unassigned or assigned to its responsible user.
   - List shared mailboxes for purchasing, accounting, shipping, returns,
     collections, and customer service.
   - Decide whether Inbox, Sent Items, or both should sync for each mailbox.
   - Where: Microsoft 365 Admin Center → Teams & groups → Shared mailboxes; individual addresses come from portal user profiles.

3. Microsoft Entra application
   - Tenant/directory ID.
   - Application/client ID.
   - Client secret value and expiration date.
   - Microsoft Graph application permission `Mail.Read` with administrator
     consent. `Mail.Send` is not required.
   - Where: [Microsoft Entra Admin Center](https://entra.microsoft.com/) → Identity → Applications → App registrations.
   - Tenant/client IDs are on the app Overview page. Create the secret under Certificates & secrets and copy its value immediately; Microsoft shows it only once.
   - Add permission under API permissions → Microsoft Graph → Application permissions → `Mail.Read`, then grant admin consent.

4. Trusted operational senders
   - Vendor and supplier domains.
   - Freight brokers and carriers.
   - Payment providers.
   - Zoho notification addresses.
   - Shipment/return notification services.
   - Where: search [Outlook](https://outlook.office.com/mail/) for shipping, invoice, receipt, order, return, tracking, BOL, and freight; record From addresses/domains.

5. Business identifier examples
   - Invoice numbers and prefixes.
   - Sales-order numbers and prefixes.
   - Purchase-order numbers and prefixes.
   - Package/shipment numbers.
   - Vendor order numbers.
   - Return/RMA numbers.
   - Where: collect two or three recent matching examples from [Zoho Books](https://books.zoho.com/) and vendor/carrier emails.

6. Approval owners
   - Shipping and freight costs.
   - Address changes.
   - Purchase-order approvals/cancellations.
   - Payments and credits.
   - Returns and replacements.
   - Unmatched or conflicting records.

7. Shipping allocation policy
   - Exact manual assignment, weight, quantity, sales value, or another rule
     when one freight invoice covers multiple orders or SKUs.
   - Treatment of line haul, fuel, liftgate, residential, insurance, tariff,
     and other accessorial charges.

## Recommended decisions

- Initial history: 90 days.
- Sync frequency: every 3–5 minutes.
- Store complete message bodies locally or retain only extracted data plus a
  Microsoft message link.
- Attachment retention period and maximum size.
- Whether low-value software/vendor receipts should enter accounting review.
- Whether customer replies may create tasks automatically.
- Escalation deadlines for missing tracking, missed pickup, delivery delay,
  address conflict, and supplier approval.

## Server environment variables

Store these only in the server environment; never commit their values:

```text
MICROSOFT_TENANT_ID
MICROSOFT_CLIENT_ID
MICROSOFT_CLIENT_SECRET
```

`MICROSOFT_MAILBOX_ADDRESS` remains an optional single-mailbox fallback. Normal
operation uses the administrator-managed mailbox list in the portal.

## Acceptance test material

Provide two or three examples for each major vendor or carrier:

- Purchase-order acknowledgment and cancellation.
- Vendor invoice and credit memo.
- Shipment confirmation and partial shipment.
- Freight booking, BOL, pallet label, and final freight invoice.
- Delivery exception and proof of delivery.
- Return label, received return, credit, and replacement.
- Payment success, failure, refund, and chargeback.
- Customer address correction or missing-contact notice.
