import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  getNgnBalance,
  getNgnLedger,
  initiateTopUp,
  initiateWithdrawal,
  getWithdrawalHistory,
  getMultiCurrencyBalance,
  getConversionQuote,
} from '@/lib/walletApi'

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
}))

import { apiFetch } from '@/lib/api'

const mockedApiFetch = vi.mocked(apiFetch)

describe('walletApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('getNgnBalance', () => {
    it('fetches NGN balance from the correct endpoint', async () => {
      const response = { availableNgn: 50000, heldNgn: 10000, totalNgn: 60000 }
      mockedApiFetch.mockResolvedValue(response)

      const result = await getNgnBalance()

      expect(mockedApiFetch).toHaveBeenCalledWith('/api/wallet/ngn/balance')
      expect(result).toEqual(response)
    })
  })

  describe('getNgnLedger', () => {
    it('fetches ledger with default params', async () => {
      const response = { entries: [], nextCursor: null }
      mockedApiFetch.mockResolvedValue(response)

      await getNgnLedger()

      expect(mockedApiFetch).toHaveBeenCalledWith(expect.stringContaining('/api/wallet/ngn/ledger?'))
    })

    it('includes cursor, limit, and type in query string', async () => {
      mockedApiFetch.mockResolvedValue({ entries: [], nextCursor: null })

      await getNgnLedger({
        cursor: 'cur_123',
        limit: 10,
        type: ['top_up', 'withdrawal'],
      })

      const calledUrl = mockedApiFetch.mock.calls[0][0] as string
      expect(calledUrl).toContain('cursor=cur_123')
      expect(calledUrl).toContain('limit=10')
      expect(calledUrl).toContain('type=top_up')
      expect(calledUrl).toContain('type=withdrawal')
    })
  })

  describe('initiateTopUp', () => {
    it('sends POST request with payload', async () => {
      const response = {
        id: 'top_1',
        amountNgn: 10000,
        rail: 'paystack' as const,
        status: 'pending' as const,
        reference: 'ref_1',
        createdAt: '2026-01-01T00:00:00Z',
      }
      mockedApiFetch.mockResolvedValue(response)

      const result = await initiateTopUp({ amountNgn: 10000, rail: 'paystack' })

      expect(mockedApiFetch).toHaveBeenCalledWith('/api/wallet/ngn/topup/initiate', {
        method: 'POST',
        body: JSON.stringify({ amountNgn: 10000, rail: 'paystack' }),
      })
      expect(result).toEqual(response)
    })
  })

  describe('initiateWithdrawal', () => {
    it('sends POST request with bank account details', async () => {
      const response = {
        id: 'wd_1',
        amountNgn: 5000,
        status: 'pending' as const,
        bankAccount: { accountNumber: '1234567890', accountName: 'Test User', bankName: 'GTBank' },
        reference: 'ref_wd',
        createdAt: '2026-01-01T00:00:00Z',
      }
      mockedApiFetch.mockResolvedValue(response)

      const result = await initiateWithdrawal({
        amountNgn: 5000,
        bankAccount: { accountNumber: '1234567890', accountName: 'Test User', bankName: 'GTBank' },
      })

      expect(result).toEqual(response)
    })
  })

  describe('getWithdrawalHistory', () => {
    it('fetches withdrawal history', async () => {
      const response = { entries: [], nextCursor: null }
      mockedApiFetch.mockResolvedValue(response)

      const result = await getWithdrawalHistory()

      expect(result).toEqual(response)
    })

    it('includes pagination params', async () => {
      mockedApiFetch.mockResolvedValue({ entries: [], nextCursor: null })

      await getWithdrawalHistory({ cursor: 'cur_abc', limit: 5 })

      const calledUrl = mockedApiFetch.mock.calls[0][0] as string
      expect(calledUrl).toContain('cursor=cur_abc')
      expect(calledUrl).toContain('limit=5')
    })
  })

  describe('getMultiCurrencyBalance', () => {
    it('fetches multi-currency balance', async () => {
      const response = {
        balances: [
          { currency: 'NGN', available: 10000, held: 0, total: 10000 },
          { currency: 'USDC', available: 50, held: 10, total: 60 },
        ],
      }
      mockedApiFetch.mockResolvedValue(response)

      const result = await getMultiCurrencyBalance()

      expect(mockedApiFetch).toHaveBeenCalledWith('/api/wallet/balance')
      expect(result).toEqual(response)
    })
  })

  describe('getConversionQuote', () => {
    it('sends conversion quote request with query params', async () => {
      const response = {
        quoteId: 'q_1',
        fromCurrency: 'NGN' as const,
        toCurrency: 'USDC' as const,
        fromAmount: 100000,
        estimatedToAmount: 60,
        rate: 1666.67,
        fees: 500,
        expiresAt: '2026-01-01T00:05:00Z',
      }
      mockedApiFetch.mockResolvedValue(response)

      const result = await getConversionQuote({
        fromCurrency: 'NGN',
        toCurrency: 'USDC',
        amount: 100000,
      })

      const calledUrl = mockedApiFetch.mock.calls[0][0] as string
      expect(calledUrl).toContain('fromCurrency=NGN')
      expect(calledUrl).toContain('toCurrency=USDC')
      expect(calledUrl).toContain('amount=100000')
      expect(result).toEqual(response)
    })
  })
})
