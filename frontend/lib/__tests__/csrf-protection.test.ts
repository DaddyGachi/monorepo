import { describe, expect, it, vi, beforeEach } from 'vitest'
import { csrfProtection, addCSRFToFormData, validateCSRFToken } from '@/lib/csrf-protection'

describe('csrfProtection', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  describe('generateNewToken', () => {
    it('generates a non-empty token', () => {
      const token = csrfProtection.generateNewToken()
      expect(token).toBeTruthy()
      expect(typeof token).toBe('string')
    })

    it('generates unique tokens on successive calls', () => {
      const t1 = csrfProtection.generateNewToken()
      const t2 = csrfProtection.generateNewToken()
      expect(t1).not.toBe(t2)
    })
  })

  describe('getCurrentToken', () => {
    it('returns null when no token exists', () => {
      expect(csrfProtection.getCurrentToken()).toBeNull()
    })

    it('returns the current token after generation', () => {
      const token = csrfProtection.generateNewToken()
      expect(csrfProtection.getCurrentToken()).toBe(token)
    })
  })

  describe('isTokenValid', () => {
    it('returns true for a valid token', () => {
      const token = csrfProtection.generateNewToken()
      expect(csrfProtection.isTokenValid(token)).toBe(true)
    })

    it('returns false for an invalid token', () => {
      csrfProtection.generateNewToken()
      expect(csrfProtection.isTokenValid('invalid-token')).toBe(false)
    })

    it('returns false when no token is stored', () => {
      expect(csrfProtection.isTokenValid('any-token')).toBe(false)
    })

    it('returns false when called without arguments and no token exists', () => {
      expect(csrfProtection.isTokenValid()).toBe(false)
    })
  })

  describe('refreshToken', () => {
    it('returns a new token different from the previous', () => {
      const old = csrfProtection.generateNewToken()
      const refreshed = csrfProtection.refreshToken()
      expect(refreshed).not.toBe(old)
    })
  })

  describe('addTokenToHeaders', () => {
    it('adds the CSRF token header', () => {
      const token = csrfProtection.generateNewToken()
      const headers = csrfProtection.addTokenToHeaders({})
      expect(headers['X-CSRF-Token']).toBe(token)
    })

    it('does not overwrite existing headers', () => {
      csrfProtection.generateNewToken()
      const headers = csrfProtection.addTokenToHeaders({ 'Content-Type': 'application/json' })
      expect(headers['Content-Type']).toBe('application/json')
      expect(headers['X-CSRF-Token']).toBeTruthy()
    })
  })

  describe('validateResponseToken', () => {
    it('returns true when the response token matches', () => {
      const token = csrfProtection.generateNewToken()
      expect(csrfProtection.validateResponseToken({ 'x-csrf-token': token })).toBe(true)
    })

    it('returns false when the response token does not match', () => {
      csrfProtection.generateNewToken()
      expect(csrfProtection.validateResponseToken({ 'x-csrf-token': 'wrong' })).toBe(false)
    })

    it('returns false when no response token is present', () => {
      csrfProtection.generateNewToken()
      expect(csrfProtection.validateResponseToken({})).toBe(false)
    })
  })

  describe('initialize', () => {
    it('generates a new token if none exists', () => {
      const token = csrfProtection.initialize()
      expect(token).toBeTruthy()
    })

    it('returns existing token if one is already stored', () => {
      const first = csrfProtection.initialize()
      const second = csrfProtection.initialize()
      expect(first).toBe(second)
    })
  })

  describe('clear', () => {
    it('removes the token', () => {
      csrfProtection.generateNewToken()
      csrfProtection.clear()
      expect(csrfProtection.getCurrentToken()).toBeNull()
    })
  })

  describe('token expiration', () => {
    it('returns null for an expired token', () => {
      vi.useFakeTimers()
      csrfProtection.generateNewToken()

      vi.advanceTimersByTime(61 * 60 * 1000)

      expect(csrfProtection.getCurrentToken()).toBeNull()
      vi.useRealTimers()
    })
  })

  describe('fetchWithCSRF', () => {
    it('attaches the CSRF token to the request', async () => {
      const token = csrfProtection.generateNewToken()
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 })
      )

      await csrfProtection.fetchWithCSRF('https://api.example.com/test')

      const calledHeaders = fetchSpy.mock.calls[0][1]?.headers as Headers
      expect(calledHeaders.get('X-CSRF-Token')).toBe(token)
    })
  })
})

describe('addCSRFToFormData', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('adds the CSRF token to FormData', () => {
    const token = csrfProtection.generateNewToken()
    const fd = new FormData()
    addCSRFToFormData(fd)
    expect(fd.get('csrf_token')).toBe(token)
  })

  it('does not set token when none exists', () => {
    const fd = new FormData()
    addCSRFToFormData(fd)
    expect(fd.get('csrf_token')).toBeNull()
  })
})

describe('validateCSRFToken', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('validates a request with a correct CSRF token', () => {
    const token = csrfProtection.generateNewToken()
    const request = new Request('https://api.example.com', {
      headers: { 'X-CSRF-Token': token },
    })
    expect(validateCSRFToken(request)).toBe(true)
  })

  it('rejects a request with an incorrect CSRF token', () => {
    csrfProtection.generateNewToken()
    const request = new Request('https://api.example.com', {
      headers: { 'X-CSRF-Token': 'wrong-token' },
    })
    expect(validateCSRFToken(request)).toBe(false)
  })

  it('validates request when no header but stored token exists (falls back to stored token)', () => {
    csrfProtection.generateNewToken()
    const request = new Request('https://api.example.com')
    expect(validateCSRFToken(request)).toBe(true)
  })
})
