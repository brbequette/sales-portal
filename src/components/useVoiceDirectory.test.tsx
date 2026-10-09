import { act, cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useVoiceDirectory } from './useVoiceDirectory'
function Directory({ enabled }: { enabled: boolean }) { useVoiceDirectory(enabled); return null }
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers() })
it('stops background directory reads while communications are on the other screen', async () => {
  const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ success: true, numbers: [], users: [] }) }))
  vi.stubGlobal('fetch', fetch)
  const { rerender } = render(<Directory enabled />)
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
  vi.useFakeTimers()
  act(() => { window.dispatchEvent(new Event('focus')); vi.advanceTimersByTime(120000) })
  expect(fetch).toHaveBeenCalledTimes(1)
  vi.useRealTimers()
  rerender(<Directory enabled={false} />)
  vi.useFakeTimers()
  act(() => { window.dispatchEvent(new Event('focus')); vi.advanceTimersByTime(120000) })
  expect(fetch).toHaveBeenCalledTimes(1)
  vi.useRealTimers()
  rerender(<Directory enabled />)
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
})
