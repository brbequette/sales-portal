'use client'

import { useSyncExternalStore } from 'react'

export const MOBILE_COMMUNICATION_QUERY = '(max-width: 767px), (max-height: 500px) and (pointer: coarse)'
let displayConnected = false
let localCallActive = false
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
export const setDisplayConnected = (value: boolean) => { displayConnected = value; listeners.forEach(listener => listener()) }
export const setLocalCallActive = (value: boolean) => { localCallActive = value }
export const hasLocalCall = () => localCallActive
export const isMobileCommunicator = () => typeof window !== 'undefined' && window.matchMedia(MOBILE_COMMUNICATION_QUERY).matches
function subscribeViewport(listener: () => void) {
  const media = window.matchMedia(MOBILE_COMMUNICATION_QUERY)
  media.addEventListener?.('change', listener)
  return () => media.removeEventListener?.('change', listener)
}
export function useCommunicationLayout() {
  const mobile = useSyncExternalStore(subscribeViewport, isMobileCommunicator, () => false)
  const secondScreen = useSyncExternalStore(subscribe, () => displayConnected, () => false)
  return { mobile, secondScreen: secondScreen && !mobile }
}
