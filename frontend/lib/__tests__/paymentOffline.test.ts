import { describe, expect, it, vi, beforeEach } from 'vitest'
import { paymentActionFingerprint, newIdempotencyKey, flushPaymentQueue } from '@/lib/paymentOffline'

vi.mock('@/lib/offline-queue', () => ({
  enqueueOfflineRequest: vi.fn(),
  flushOfflineQueue: vi.fn().mockResolvedValue(0),
}))

import { flushOfflineQueue } from '@/lib/offline-queue'

const mockedFlush = vi.mocked(flushOfflineQueue)

describe('paymentOffline', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('paymentActionFingerprint', () => {
    it('generates a fingerprint from operation and body', () => {
      const fp = paymentActionFingerprint('tenant-quick-pay', { amount: 1000 })
      expect(fp).toBe('tenant-quick-pay:{"amount":1000}')
    })

    it('produces consistent fingerprints for same input', () => {
      const fp1 = paymentActionFingerprint('tenant-topup', { amount: 500 })
      const fp2 = paymentActionFingerprint('tenant-topup', { amount: 500 })
      expect(fp1).toBe(fp2)
    })

    it('produces different fingerprints for different inputs', () => {
      const fp1 = paymentActionFingerprint('tenant-quick-pay', { amount: 100 })
      const fp2 = paymentActionFingerprint('tenant-quick-pay', { amount: 200 })
      expect(fp1).not.toBe(fp2)
    })

    it('handles ngn-topup operation', () => {
      const fp = paymentActionFingerprint('ngn-topup', { amount: 5000 })
      expect(fp).toContain('ngn-topup')
    })
  })

  describe('newIdempotencyKey', () => {
    it('generates a unique key', () => {
      const key1 = newIdempotencyKey()
      const key2 = newIdempotencyKey()
      expect(key1).not.toBe(key2)
    })

    it('generates a UUID when crypto.randomUUID is available', () => {
      const key = newIdempotencyKey()
      expect(typeof key).toBe('string')
      expect(key.length).toBeGreaterThan(0)
    })
  })

  describe('flushPaymentQueue', () => {
    it('calls flushOfflineQueue with the base URL', async () => {
      mockedFlush.mockResolvedValue(2)

      const count = await flushPaymentQueue()

      expect(mockedFlush).toHaveBeenCalledWith(expect.any(String))
      expect(count).toBe(2)
    })
  })
})
