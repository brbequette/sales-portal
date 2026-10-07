# Temporary ZDialer provider

The user authorized replacing blocked embedded calls and individual text sends with ZDialer on October 7, 2026. `USE_ZDIALER` defaults to true. Only a separately verified SDK restoration should set `NEXT_PUBLIC_CALLING_PROVIDER=browser_softphone` and rebuild; the retained SDK does not silently activate after an unsuccessful handoff.

## Desktop

The official extension adds controls next to a `tel:` anchor. Titan invokes only the provider-created control adjacent to the exact normalized recipient after a user's click. It never invents a `window.ZDialer` API. If the controls are missing, show setup/retry guidance and do not claim a call. The optional desktop-app link uses the `zohovoice://call=NUMBER` form present in the published extension. No automatic retries or fallback calls.

The adapter's selectors and desktop link were inspected in Zoho's official Chrome extension 3.9.2, ID `gnpglhdhioifppkjdpmlmolgeanpaofi`, `js/VoiceMainG.content_script.js` (`injectVoiceIcon`, `documentClick`, `sendCall`, `getNumber`). Third-party source is not bundled into Titan. Updates to that extension require rechecking compatibility. Firefox/Edge use the same documented extension workflow, but this release does not claim live verification on those browsers.

## Mobile

Device user agent identifies Android/iOS, including iPad desktop mode; viewport width controls layout only. Calling uses `tel:` only after the user confirms ZDialer is the device's default calling app. Browser code cannot independently verify that setting. No desktop custom scheme or personal `sms:` fallback is used on mobile. Mobile SMS currently requires copying the recipient and draft and switching to the installed ZDialer app; no supported direct draft-link format was verified. The UI explains this limitation explicitly.

## Data and safety

All individual SMS composers preserve drafts and hand off through the shared body-portaled dialog. Database-only preflight checks authentication, account/contact access and existing protected/technical SMS suppression without an override. ZDialer performs actual sender authorization and sending. The app does not add sent messages, start call timers, infer delivery, or count opening a provider as a connected call. Existing webhooks and saved history remain; no provider synchronization is restarted. ZDialer contains current provider history while Titan sync is paused.

Main-screen draft handoffs follow the paired communicator. Mobile retains a full-screen local interface. No new provider grant, migration, test call, message, plan purchase, or business-data write is required by this release.

## Primary references

- https://www.zoho.com/voice/zdialer.html
- https://www.zoho.com/voice/help/functions-in-zdialer.html
- https://www.zoho.com/voice/help/zdialer-app-for-ios.html
- https://www.zoho.com/voice/help/zdialer-app-for-android.html
- https://chrome.google.com/webstore/detail/zdialer-zoho-voice-extens/gnpglhdhioifppkjdpmlmolgeanpaofi

Validation: 37 focused regressions and full TypeScript pass. Isolated real-component desktop/390px mobile layout checks use in-memory data and blocked provider networking; they do not establish an actual completed call or SMS on a physical handset.
