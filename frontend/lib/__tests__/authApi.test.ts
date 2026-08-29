import { describe, expect, it, vi, beforeEach } from 'vitest'
import { requestOtp, verifyOtp, requestWalletChallenge, verifyWalletSignature } from '@/lib/authApi'

vi.mock('@/lib/api', () => ({
  apiPost: vi.fn(),
}))

import { apiPost } from '@/lib/api'
import * as auth from '@/lib/auth'

const mockedApiPost = vi.mocked(apiPost)

describe('authApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  describe('requestOtp', () => {
    it('calls apiPost with the correct endpoint and email', async () => {
      mockedApiPost.mockResolvedValue({ message: 'OTP sent' })

      const result = await requestOtp('user@example.com')

      expect(mockedApiPost).toHaveBeenCalledWith('/api/auth/request-otp', { email: 'user@example.com' })
      expect(result).toEqual({ message: 'OTP sent' })
    })

    it('propagates API errors', async () => {
      mockedApiPost.mockRejectedValue(new Error('Network error'))

      await expect(requestOtp('user@example.com')).rejects.toThrow('Network error')
    })
  })

  describe('verifyOtp', () => {
    it('calls apiPost and stores the returned token', async () => {
      const response = {
        token: 'auth-token-123',
        user: { id: '1', email: 'user@example.com', name: 'Test', role: 'tenant' as const },
      }
      mockedApiPost.mockResolvedValue(response)

      const result = await verifyOtp('user@example.com', '123456')

      expect(mockedApiPost).toHaveBeenCalledWith('/api/auth/verify-otp', {
        email: 'user@example.com',
        otp: '123456',
      })
      expect(result).toEqual(response)
      expect(localStorage.getItem('shelterflex_token')).toBe('auth-token-123')
    })

    it('propagates API errors without storing token', async () => {
      mockedApiPost.mockRejectedValue(new Error('Invalid OTP'))

      await expect(verifyOtp('user@example.com', '000000')).rejects.toThrow('Invalid OTP')
      expect(localStorage.getItem('shelterflex_token')).toBeNull()
    })
  })

  describe('requestWalletChallenge', () => {
    it('calls apiPost with the correct endpoint and address', async () => {
      const response = { challengeXdr: 'xdr-data', expiresAt: '2026-01-01T00:00:00Z' }
      mockedApiPost.mockResolvedValue(response)

      const result = await requestWalletChallenge('GABC123')

      expect(mockedApiPost).toHaveBeenCalledWith('/api/auth/wallet/challenge', { address: 'GABC123' })
      expect(result).toEqual(response)
    })
  })

  describe('verifyWalletSignature', () => {
    it('calls apiPost and stores the returned token', async () => {
      const response = {
        token: 'wallet-token-456',
        user: { id: '2', email: 'wallet@example.com', name: 'Wallet User', role: 'landlord' as const },
      }
      mockedApiPost.mockResolvedValue(response)

      const result = await verifyWalletSignature('GABC123', 'signed-xdr')

      expect(mockedApiPost).toHaveBeenCalledWith('/api/auth/wallet/verify', {
        address: 'GABC123',
        signedChallengeXdr: 'signed-xdr',
      })
      expect(result).toEqual(response)
      expect(localStorage.getItem('shelterflex_token')).toBe('wallet-token-456')
    })

    it('propagates API errors without storing token', async () => {
      mockedApiPost.mockRejectedValue(new Error('Invalid signature'))

      await expect(verifyWalletSignature('GABC123', 'bad-xdr')).rejects.toThrow('Invalid signature')
      expect(localStorage.getItem('shelterflex_token')).toBeNull()
    })
  })
})
