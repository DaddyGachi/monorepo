import { describe, expect, it, vi, beforeEach } from 'vitest'
import { getQuote, initiateDeposit, getTransactionStatus, NgnStakingApiError } from '@/lib/ngnStakingApi'

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
}))

import { apiFetch } from '@/lib/api'

const mockedApiFetch = vi.mocked(apiFetch)

describe('ngnStakingApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('NgnStakingApiError', () => {
    it('is an instance of Error', () => {
      const err = new NgnStakingApiError('test error')
      expect(err).toBeInstanceOf(Error)
      expect(err.name).toBe('NgnStakingApiError')
    })

    it('stores statusCode and originalError', () => {
      const original = new Error('orig')
      const err = new NgnStakingApiError('msg', 500, original)
      expect(err.statusCode).toBe(500)
      expect(err.originalError).toBe(original)
    })
  })

  describe('getQuote', () => {
    it('returns quote on success', async () => {
      const quote = {
        id: 'q_1',
        ngnAmount: 100000,
        usdcAmount: 60,
        fxRate: 1666.67,
        fees: { conversionFee: 100, platformFee: 200, total: 300 },
        expiresAt: '2026-01-01T00:05:00Z',
        createdAt: '2026-01-01T00:00:00Z',
      }
      mockedApiFetch.mockResolvedValue({ success: true, quote })

      const result = await getQuote(100000)

      expect(mockedApiFetch).toHaveBeenCalledWith('/api/staking/ngn/quote', {
        method: 'POST',
        body: JSON.stringify({ ngnAmount: 100000 }),
      })
      expect(result).toEqual(quote)
    })

    it('throws NgnStakingApiError when success is false', async () => {
      mockedApiFetch.mockResolvedValue({ success: false, quote: null })

      await expect(getQuote(100000)).rejects.toThrow(NgnStakingApiError)
    })

    it('wraps non-NgnStakingApiError errors', async () => {
      mockedApiFetch.mockRejectedValue(new Error('Network error'))

      await expect(getQuote(100000)).rejects.toThrow(NgnStakingApiError)
    })
  })

  describe('initiateDeposit', () => {
    it('returns deposit initiation response on success', async () => {
      const response = {
        success: true,
        transactionId: 'txn_1',
        paymentInstructions: { paystackUrl: 'https://paystack.com/xyz' },
      }
      mockedApiFetch.mockResolvedValue(response)

      const result = await initiateDeposit('q_1', 'paystack')

      expect(result).toEqual(response)
    })

    it('defaults to paystack payment method', async () => {
      mockedApiFetch.mockResolvedValue({
        success: true,
        transactionId: 'txn_1',
        paymentInstructions: {},
      })

      await initiateDeposit('q_1')

      const calledBody = JSON.parse(mockedApiFetch.mock.calls[0][1]?.body as string)
      expect(calledBody.paymentMethod).toBe('paystack')
    })

    it('throws on invalid response', async () => {
      mockedApiFetch.mockResolvedValue({ success: false })

      await expect(initiateDeposit('q_1')).rejects.toThrow(NgnStakingApiError)
    })
  })

  describe('getTransactionStatus', () => {
    it('returns transaction status on success', async () => {
      const status = {
        transactionId: 'txn_1',
        status: 'confirmed' as const,
        ngnAmount: 100000,
        usdcAmount: 60,
        updatedAt: '2026-01-01T00:10:00Z',
      }
      mockedApiFetch.mockResolvedValue({ success: true, status })

      const result = await getTransactionStatus('txn_1')

      expect(mockedApiFetch).toHaveBeenCalledWith('/api/staking/ngn/status/txn_1')
      expect(result).toEqual(status)
    })

    it('throws on invalid response', async () => {
      mockedApiFetch.mockResolvedValue({ success: false, status: null })

      await expect(getTransactionStatus('txn_1')).rejects.toThrow(NgnStakingApiError)
    })

    it('wraps network errors', async () => {
      mockedApiFetch.mockRejectedValue(new TypeError('Failed to fetch'))

      await expect(getTransactionStatus('txn_1')).rejects.toThrow(NgnStakingApiError)
    })
  })
})
