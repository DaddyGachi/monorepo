import { describe, expect, it, vi, beforeEach } from 'vitest'
import { getFullPaymentPreview, confirmFullPayment } from '@/lib/paymentApi'

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
}))

import { apiFetch } from '@/lib/api'

const mockedApiFetch = vi.mocked(apiFetch)

describe('paymentApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('getFullPaymentPreview', () => {
    it('calls apiFetch with the correct endpoint', async () => {
      const response = {
        paymentId: 'pay_123',
        breakdown: {
          totalAmount: 100000,
          platformShare: 5000,
          reporterShare: 2000,
          landlordAmount: 93000,
          currency: 'NGN',
        },
        expiresAt: '2026-01-01T00:00:00Z',
      }
      mockedApiFetch.mockResolvedValue(response)

      const result = await getFullPaymentPreview('pay_123')

      expect(mockedApiFetch).toHaveBeenCalledWith('/api/payments/pay_123/full-payment/preview')
      expect(result).toEqual(response)
    })

    it('propagates API errors', async () => {
      mockedApiFetch.mockRejectedValue(new Error('Not found'))

      await expect(getFullPaymentPreview('missing')).rejects.toThrow('Not found')
    })
  })

  describe('confirmFullPayment', () => {
    it('calls apiFetch with POST method', async () => {
      const response = {
        paymentId: 'pay_123',
        reference: 'ref_abc',
        breakdown: {
          totalAmount: 100000,
          platformShare: 5000,
          reporterShare: null,
          landlordAmount: 95000,
          currency: 'NGN',
        },
        paidAt: '2026-01-01T00:00:00Z',
        status: 'confirmed' as const,
      }
      mockedApiFetch.mockResolvedValue(response)

      const result = await confirmFullPayment('pay_123')

      expect(mockedApiFetch).toHaveBeenCalledWith('/api/payments/pay_123/full-payment/confirm', {
        method: 'POST',
      })
      expect(result).toEqual(response)
    })

    it('propagates API errors', async () => {
      mockedApiFetch.mockRejectedValue(new Error('Payment failed'))

      await expect(confirmFullPayment('pay_fail')).rejects.toThrow('Payment failed')
    })
  })
})
