import { expect, it } from 'vitest'
import { navigationItems } from './navigation'
it('gives every destination a unique route and icon, including inbox and collections reporting', () => {
  expect(new Set(navigationItems.map(item => item.href)).size).toBe(navigationItems.length)
  expect(new Set(navigationItems.map(item => item.icon)).size).toBe(navigationItems.length)
  expect(navigationItems.map(item => item.href)).toEqual(expect.arrayContaining(['/communications', '/messages/email', '/collections/stats', '/shipping']))
})
