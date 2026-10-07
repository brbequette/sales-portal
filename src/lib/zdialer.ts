// Temporary default until Zoho supports this tenant's embedded WebSDK login.
// The old SDK remains available for a separately verified restoration.
export const USE_ZDIALER = process.env.NEXT_PUBLIC_CALLING_PROVIDER !== 'browser_softphone'
export type ZDialerPlatform = 'desktop' | 'ios' | 'android'

export function zdialerPlatform(nav: Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'>): ZDialerPlatform {
  if (/android/i.test(nav.userAgent)) return 'android'
  if (/iPhone|iPad|iPod/i.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)) return 'ios'
  return 'desktop'
}

export function zdialerNumber(input: string): string {
  if (!/^[+\d\s().-]+$/.test(input.trim())) return ''
  const number = input.replace(/[\s().-]/g, '')
  if (!/^\+?\d{3,15}$/.test(number)) return ''
  if (number.startsWith('+')) return /^\+[1-9]\d{6,14}$/.test(number) ? number : ''
  if (number.length === 10) return `+1${number}`
  if (number.length === 11 && number.startsWith('1')) return `+${number}`
  return number.length <= 6 ? number : '' // Extensions; require +country for other international numbers.
}

// Inspect only the controls the installed provider extension added beside this
// exact recipient. Never synthesize its private globals, classes or call status.
// Verified against Zoho's published Chrome extension 3.9.2 content_script.js.
export function zdialerControl(anchor: HTMLAnchorElement | null): HTMLElement | null {
  const controls = anchor?.nextElementSibling
  if (!anchor?.classList.contains('zvoice-extn-ctc') || !controls?.classList.contains('zvoice-extn-ctc-main')) return null
  return controls.querySelector<HTMLElement>('.zvoice-extn-ct-pop-call') || controls.querySelector<HTMLElement>('.zvoice-extn-ctc-btn')
}
