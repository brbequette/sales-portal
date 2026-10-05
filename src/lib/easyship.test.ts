// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createShipmentAndBuyLabel, getEasyshipRates, getExistingShipmentRates, type CreateShipmentParams } from './easyship'

vi.mock('@/lib/prisma', () => ({ prisma: { systemSetting: { findMany: vi.fn().mockResolvedValue([]) } } }))
vi.mock('@/lib/company-config', () => ({ COMPANY_CONFIG: {
  name: 'Test Shipper', phone: '5555550100', email: 'test@example.com', shippingEmail: 'test@example.com',
  address: { line1: '1 Test St', city: 'Phoenix', state: 'AZ', zip: '85001', country: 'US' },
} }))

const dimensions = { length: 15, width: 12, height: 4 }
const metricBox = { length: 38.1, width: 30.48, height: 10.16 }
const params: CreateShipmentParams = {
  destinationAddress: { postal_code: '85001', country_alpha2: 'US' },
  destinationContactName: 'Test Recipient',
  courierServiceId: 'test-courier',
  weight: 10,
  dimensions,
  items: [{ description: 'Blades', quantity: 3, declaredValue: 10, weight: 10 }],
}
const fetchMock = vi.fn()
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const labelResponse = () => response({ shipment: { tracking_number: 'TEST', label_state: 'created' } })
const bodyAt = (index: number) => JSON.parse(fetchMock.mock.calls[index][1].body)

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('EASYSHIP_API_KEY', 'test-key')
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('Easyship package dimensions', () => {
  it('quotes the outer box in centimeters regardless of item quantity', async () => {
    fetchMock.mockResolvedValueOnce(response({ rates: [] }))
    await getEasyshipRates({
      destination_address: params.destinationAddress,
      parcels: [{ total_actual_weight: 10, box: { slug: 'custom' }, items: [{
        description: 'Blades', category: 'home_appliances', quantity: 3,
        actual_weight: 10, dimensions,
      }] }],
    })
    expect(bodyAt(0).parcels[0]).toMatchObject({ box: metricBox, total_actual_weight: 4.536 })
    expect(bodyAt(0).parcels[0].box).not.toHaveProperty('slug')
  })

  it.each([false, true])('sends outer dimensions when existing shipment is %s', async existing => {
    fetchMock.mockResolvedValueOnce(response({ shipment: { easyship_shipment_id: 'ES-test' } }))
      .mockResolvedValueOnce(labelResponse())
    await createShipmentAndBuyLabel({ ...params, existingEasyshipId: existing ? 'ES-test' : undefined })
    expect(fetchMock.mock.calls[0][1].method).toBe(existing ? 'PATCH' : 'POST')
    expect(bodyAt(0).parcels[0].box).toEqual(metricBox)
    expect(fetchMock.mock.calls[1][0]).toMatch(/\/ES-test\/label$/)
  })

  it.each([false, true])('keeps distinct dimensions for multiple boxes, existing=%s', async existing => {
    fetchMock.mockResolvedValueOnce(response({ shipment: { easyship_shipment_id: 'ES-multi' } }))
      .mockResolvedValueOnce(labelResponse())
    await createShipmentAndBuyLabel({
      ...params, existingEasyshipId: existing ? 'ES-multi' : undefined,
      parcels: [{ weight: 10, dimensions }, { weight: 5, dimensions: { length: 17, width: 17, height: 0.5 } }],
    })
    expect(bodyAt(0).parcels.map((p: { box: unknown }) => p.box)).toEqual([
      metricBox, { length: 43.18, width: 43.18, height: 1.27 },
    ])
  })

  it('updates a shipment found by order number before buying its label', async () => {
    fetchMock.mockResolvedValueOnce(response({ shipments: [{ easyship_shipment_id: 'ES-synced', label_state: 'not_created' }] }))
      .mockResolvedValueOnce(response({}))
      .mockResolvedValueOnce(labelResponse())
    await createShipmentAndBuyLabel({ ...params, platformOrderNumber: 'PKG-test' })
    expect(fetchMock.mock.calls[1][1].method).toBe('PATCH')
    expect(bodyAt(1).parcels[0].box).toEqual(metricBox)
  })

  it.each([422, 500])('does not purchase a label when dimensions update fails with %s', async status => {
    fetchMock.mockResolvedValueOnce(response({ error: 'Rejected' }, status))
    await expect(createShipmentAndBuyLabel({ ...params, existingEasyshipId: 'ES-test' }))
      .rejects.toThrow('Label purchase stopped')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not purchase a label after a network failure updating dimensions', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Connection lost'))
    await expect(createShipmentAndBuyLabel({ ...params, existingEasyshipId: 'ES-test' }))
      .rejects.toThrow('Connection lost')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([0, -1, NaN, Infinity])('rejects invalid box dimensions before provider calls: %s', async height => {
    await expect(createShipmentAndBuyLabel({ ...params, dimensions: { ...dimensions, height } }))
      .rejects.toThrow('must be positive')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    { length: 0, width: 0, height: 0 },
    { ...metricBox, height: 2.54 },
    undefined,
  ])('rejects cached rates for different or missing box dimensions: %j', async outer_dimensions => {
    fetchMock.mockResolvedValueOnce(response({ shipments: [{
      easyship_shipment_id: 'ES-stale', rates: [{ total_charge: 1 }],
      parcels: [{ total_actual_weight: 4.536, box: { outer_dimensions } }],
    }] }))
    expect(await getExistingShipmentRates('PKG-test', { weight: 10, dimensions })).toBeNull()
  })

  it('reuses cached rates only for matching dimensions and weight', async () => {
    fetchMock.mockResolvedValueOnce(response({ shipments: [{
      easyship_shipment_id: 'ES-match', rates: [{ total_charge: 15 }],
      parcels: [{ total_actual_weight: 4.536, box: { outer_dimensions: metricBox } }],
    }] }))
    expect(await getExistingShipmentRates('PKG-test', { weight: 10, dimensions }))
      .toMatchObject({ shipmentId: 'ES-match', rates: [{ totalCharge: 15 }] })
  })

  it('rejects cached rates when the weight changed despite matching dimensions', async () => {
    fetchMock.mockResolvedValueOnce(response({ shipments: [{
      easyship_shipment_id: 'ES-old-weight', rates: [{ total_charge: 15 }],
      parcels: [{ total_actual_weight: 2.268, box: { outer_dimensions: metricBox } }],
    }] }))
    expect(await getExistingShipmentRates('PKG-test', { weight: 10, dimensions })).toBeNull()
  })
})
