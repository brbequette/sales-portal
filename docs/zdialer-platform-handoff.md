# Temporary ZDialer calling

The user's latest instruction on October 7, 2026 is authoritative: **ZDialer handles calls only. SMS remains inside Titan on desktop and mobile.** This supersedes the earlier combined call/text handoff.

`USE_ZDIALER` controls calling only and defaults to true. Only a separately verified SDK restoration should set `NEXT_PUBLIC_CALLING_PROVIDER=browser_softphone` and rebuild.

## Desktop calls

The official extension adds controls next to a `tel:` anchor. Titan invokes only the provider-created call control adjacent to the exact recipient after a user's click. Missing controls produce setup guidance. The optional installed desktop app uses `zohovoice://call=NUMBER`. No automatic retries or fallback calls.

Selectors and desktop link were inspected in official Chrome extension 3.9.2, ID `gnpglhdhioifppkjdpmlmolgeanpaofi`. Extension updates require compatibility checks. Third-party source is not bundled. No live Firefox/Edge call verification is claimed.

## Mobile calls

Android/iOS device identity, including iPad desktop mode, selects the mobile path; viewport width controls layout only. `tel:` handoff is enabled after the user confirms ZDialer is the default calling app. Browser code cannot independently verify that setting. No desktop custom scheme is used on mobile.

## Internal SMS

All individual composers use the existing Titan SMS service, including the account communicator, global Messages, account hub and second-screen quick SMS. Assigned sender selection is restored. The existing service enforces account/contact access, sender authorization, suppression and operation IDs. Drafts clear only after provider acceptance; rejected or uncertain sends remain visible in Titan. No external SMS links, SMS handoff dialog or ZDialer SMS preflight remain.

Sender inventory loads when the composer mounts; no periodic or focus-triggered inventory polling is restored. Sender authorization is independently checked at send time. Bulk Zoho sync remains paused. The provider still transports SMS through the existing Zoho Voice API; the user composes, sends and reads messages in Titan.

Opening ZDialer does not establish a connected call or create a call timer. No actual customer call or text is required for release validation.

## Provider references

- https://www.zoho.com/voice/zdialer.html
- https://www.zoho.com/voice/help/functions-in-zdialer.html
- https://www.zoho.com/voice/help/zdialer-app-for-ios.html
- https://www.zoho.com/voice/help/zdialer-app-for-android.html
