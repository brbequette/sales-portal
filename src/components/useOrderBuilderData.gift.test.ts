import { describe, expect, it } from 'vitest'
import { getBooksItemId, TITAN_GIFT_HAT, TITAN_GIFT_HAT_BOOKS_ITEM_ID } from './useOrderBuilderData'

describe('authoritative Titan gift hat', () => {
  it('retains the exact Books item at zero sales price and twenty-dollar cost', () => {
    expect(TITAN_GIFT_HAT_BOOKS_ITEM_ID).toBe('1254360000043727500')
    expect(getBooksItemId(TITAN_GIFT_HAT)).toBe(TITAN_GIFT_HAT_BOOKS_ITEM_ID)
    expect(TITAN_GIFT_HAT).toMatchObject({
      price: 0,
      cost: 20,
      costQuality: 'AUTHORITATIVE',
      giftItem: true,
      subjectToVig: false,
    })
  })
})
