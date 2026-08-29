import { describe, expect, it, vi, beforeEach } from 'vitest'
import { SecurityTests } from '@/lib/security-tests'

vi.mock('@/lib/secure-storage', () => ({
  secureStorage: {
    setItem: vi.fn().mockResolvedValue(undefined),
    getItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  },
}))

vi.mock('@/lib/csrf-protection', () => ({
  csrfProtection: {
    generateNewToken: vi.fn().mockReturnValue('test-csrf-token'),
    getCurrentToken: vi.fn().mockReturnValue('test-csrf-token'),
    isTokenValid: vi.fn().mockReturnValue(true),
    refreshToken: vi.fn().mockReturnValue('new-csrf-token'),
    addTokenToHeaders: vi.fn().mockReturnValue({ 'X-CSRF-Token': 'test-csrf-token' }),
  },
}))

vi.mock('@/lib/rate-limiter', () => {
  return {
    default: class MockRateLimiter {
      private remaining: number
      constructor(private opts: { maxRequests: number; windowMs: number }) {
        this.remaining = opts.maxRequests
      }
      checkLimit(_key: string) {
        if (this.remaining > 0) {
          this.remaining--
          return { allowed: true, remaining: this.remaining }
        }
        return { allowed: false, remaining: 0 }
      }
      reset(_key: string) {
        this.remaining = this.opts.maxRequests
      }
    },
  }
})

describe('SecurityTests', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('testXSSProtection', () => {
    it('runs XSS sanitization tests and returns results', () => {
      const result = SecurityTests.testXSSProtection()
      expect(result).toHaveProperty('passed')
      expect(result).toHaveProperty('details')
      expect(Array.isArray(result.details)).toBe(true)
    })
  })

  describe('testCSRFProtection', () => {
    it('runs CSRF tests and returns results', async () => {
      const result = await SecurityTests.testCSRFProtection()
      expect(result).toHaveProperty('passed')
      expect(result).toHaveProperty('details')
      expect(Array.isArray(result.details)).toBe(true)
    })
  })

  describe('testRateLimiting', () => {
    it('validates normal operation, limit exceeded, and reset', async () => {
      const result = await SecurityTests.testRateLimiting()
      expect(result.passed).toBe(true)
      expect(result.details.every((d: string) => d.startsWith('✅'))).toBe(true)
    })
  })

  describe('testSecureStorage', () => {
    it('validates set, get, expiration, and removal', async () => {
      const { secureStorage } = await import('@/lib/secure-storage')
      vi.mocked(secureStorage.getItem)
        .mockResolvedValueOnce('test_sensitive_data')
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)

      const result = await SecurityTests.testSecureStorage()
      expect(result.passed).toBe(true)
    })
  })

  describe('testCSPHeaders', () => {
    it('handles fetch failure gracefully', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'))

      const result = await SecurityTests.testCSPHeaders()
      expect(result.passed).toBe(false)
      expect(result.details.some((d: string) => d.includes('Error testing CSP headers'))).toBe(true)
    })
  })

  describe('runAllTests', () => {
    it('returns overall result with all sub-results', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No server'))

      const result = await SecurityTests.runAllTests()

      expect(result).toHaveProperty('overall')
      expect(result).toHaveProperty('results')
      expect(result.results).toHaveProperty('csp')
      expect(result.results).toHaveProperty('storage')
      expect(result.results).toHaveProperty('rateLimit')
      expect(result.results).toHaveProperty('csrf')
      expect(result.results).toHaveProperty('xss')
    })
  })

  describe('generateReport', () => {
    it('generates a markdown report', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No server'))

      const results = await SecurityTests.runAllTests()
      const report = SecurityTests.generateReport(results)

      expect(report).toContain('# Security Test Report')
      expect(report).toContain('Overall Status:')
      expect(report).toContain('## CSP Headers')
      expect(report).toContain('## CSRF Protection')
    })
  })
})
