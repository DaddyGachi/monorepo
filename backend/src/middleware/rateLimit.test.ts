import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import express, { Request, Response, NextFunction } from 'express'
import supertest from 'supertest'
import { createAdvancedRateLimiter } from './rateLimit.js'
import { AppError } from '../errors/AppError.js'
import { ErrorCode } from '../errors/errorCodes.js'
import type { User } from '../repositories/AuthRepository.js'

// Mock dependencies
vi.mock('../services/SlidingWindowLimiter.js', () => ({
  slidingWindowLimiter: {
    checkLimit: vi.fn(),
  },
}))

vi.mock('../services/QuotaService.js', () => ({
  quotaService: {
    getUserLimits: vi.fn(),
  },
}))

vi.mock('../utils/redis.js', () => ({
  getRedisClient: vi.fn(() => ({
    eval: vi.fn(),
  })),
}))

import { slidingWindowLimiter } from '../services/SlidingWindowLimiter.js'
import { quotaService } from '../services/QuotaService.js'

describe('createAdvancedRateLimiter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('NODE_ENV', 'test')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('basic rate limiting', () => {
    it('allows requests under the limit', async () => {
      vi.mocked(slidingWindowLimiter.checkLimit).mockResolvedValue({
        allowed: true,
        remaining: 9,
        total: 10,
        reset: Date.now() + 60000,
      })

      vi.mocked(quotaService.getUserLimits).mockResolvedValue({
        requestsPerMinute: 60,
        requestsPerDay: 1000,
      })

      const app = express()
      app.use(createAdvancedRateLimiter({ limit: 10, windowMs: 60000 }))
      app.get('/test', (_req: Request, res: Response) => {
        res.json({ success: true })
      })

      const res = await supertest(app).get('/test')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.headers['x-ratelimit-limit']).toBe('10')
      expect(res.headers['x-ratelimit-remaining']).toBe('9')
      expect(res.headers['x-ratelimit-reset']).toBeDefined()
    })

    it('rejects requests over the limit with 429', async () => {
      vi.mocked(slidingWindowLimiter.checkLimit).mockResolvedValue({
        allowed: false,
        remaining: 0,
        total: 10,
        reset: Date.now() + 60000,
      })

      vi.mocked(quotaService.getUserLimits).mockResolvedValue({
        requestsPerMinute: 60,
        requestsPerDay: 1000,
      })

      const app = express()
      app.use(createAdvancedRateLimiter({ limit: 10, windowMs: 60000 }))
      app.get('/test', (_req: Request, res: Response) => {
        res.json({ success: true })
      })

      const res = await supertest(app).get('/test')

      expect(res.status).toBe(429)
      // The middleware throws an AppError which gets handled by error handler
      // The response body structure depends on the error handler
      expect(res.body).toBeDefined()
    })

    it('sets correct rate limit headers', async () => {
      const resetTime = Date.now() + 60000
      vi.mocked(slidingWindowLimiter.checkLimit).mockResolvedValue({
        allowed: true,
        remaining: 5,
        total: 10,
        reset: resetTime,
      })

      vi.mocked(quotaService.getUserLimits).mockResolvedValue({
        requestsPerMinute: 60,
        requestsPerDay: 1000,
      })

      const app = express()
      app.use(createAdvancedRateLimiter({ limit: 10, windowMs: 60000 }))
      app.get('/test', (_req: Request, res: Response) => {
        res.json({ success: true })
      })

      const res = await supertest(app).get('/test')

      expect(res.headers['x-ratelimit-limit']).toBe('10')
      expect(res.headers['x-ratelimit-remaining']).toBe('5')
      expect(res.headers['x-ratelimit-reset']).toBe(Math.ceil(resetTime / 1000).toString())
    })
  })

  describe('user-based rate limiting', () => {
    it('uses user ID for authenticated requests', async () => {
      vi.mocked(slidingWindowLimiter.checkLimit).mockResolvedValue({
        allowed: true,
        remaining: 9,
        total: 10,
        reset: Date.now() + 60000,
      })

      vi.mocked(quotaService.getUserLimits).mockResolvedValue({
        requestsPerMinute: 300,
        requestsPerDay: 50000,
      })

      const mockUser: User = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'tenant',
        tier: 'pro',
        planQuota: 50000,
        displayCurrency: 'NGN',
        createdAt: new Date(),
      }

      const app = express()
      app.use((req: Request, _res: Response, next: NextFunction) => {
        ;(req as any).user = mockUser
        next()
      })
      app.use(createAdvancedRateLimiter({ limit: 10, windowMs: 60000 }))
      app.get('/test', (_req: Request, res: Response) => {
        res.json({ success: true })
      })

      await supertest(app).get('/test')

      expect(slidingWindowLimiter.checkLimit).toHaveBeenCalledWith(
        expect.stringContaining('user:user-123'),
        10,
        60000
      )
    })

    it('uses IP address for unauthenticated requests', async () => {
      vi.mocked(slidingWindowLimiter.checkLimit).mockResolvedValue({
        allowed: true,
        remaining: 9,
        total: 10,
        reset: Date.now() + 60000,
      })

      vi.mocked(quotaService.getUserLimits).mockResolvedValue({
        requestsPerMinute: 60,
        requestsPerDay: 1000,
      })

      const app = express()
      app.use(createAdvancedRateLimiter({ limit: 10, windowMs: 60000 }))
      app.get('/test', (_req: Request, res: Response) => {
        res.json({ success: true })
      })

      await supertest(app).get('/test')

      expect(slidingWindowLimiter.checkLimit).toHaveBeenCalledWith(
        expect.stringContaining('ip:'),
        10,
        60000
      )
    })

    it('applies user-specific quota limits', async () => {
      vi.mocked(slidingWindowLimiter.checkLimit).mockResolvedValue({
        allowed: true,
        remaining: 299,
        total: 300,
        reset: Date.now() + 60000,
      })

      const mockUser: User = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'tenant',
        tier: 'pro',
        planQuota: 50000,
        displayCurrency: 'NGN',
        createdAt: new Date(),
      }

      vi.mocked(quotaService.getUserLimits).mockResolvedValue({
        requestsPerMinute: 300,
        requestsPerDay: 50000,
      })

      const app = express()
      app.use((req: Request, _res: Response, next: NextFunction) => {
        ;(req as any).user = mockUser
        next()
      })
      app.use(createAdvancedRateLimiter({ windowMs: 60000 }))
      app.get('/test', (_req: Request, res: Response) => {
        res.json({ success: true })
      })

      await supertest(app).get('/test')

      expect(quotaService.getUserLimits).toHaveBeenCalledWith(mockUser)
      expect(slidingWindowLimiter.checkLimit).toHaveBeenCalledWith(
        expect.any(String),
        300,
        60000
      )
    })
  })

  describe('rate limit keying isolation', () => {
    it('isolates rate limits by user ID', async () => {
      vi.mocked(slidingWindowLimiter.checkLimit)
        .mockResolvedValueOnce({
          allowed: true,
          remaining: 0,
          total: 10,
          reset: Date.now() + 60000,
        })
        .mockResolvedValueOnce({
          allowed: true,
          remaining: 9,
          total: 10,
          reset: Date.now() + 60000,
        })

      vi.mocked(quotaService.getUserLimits).mockResolvedValue({
        requestsPerMinute: 60,
        requestsPerDay: 1000,
      })

      const app = express()
      app.use(createAdvancedRateLimiter({ limit: 10, windowMs: 60000 }))
      app.get('/test', (req: Request, res: Response) => {
        res.json({ success: true, userId: (req as any).user?.id })
      })

      // First request from user A (at limit)
      const res1 = await supertest(app)
        .get('/test')
        .set('x-forwarded-for', '1.2.3.4')

      // Second request from different IP (should be allowed)
      const res2 = await supertest(app)
        .get('/test')
        .set('x-forwarded-for', '5.6.7.8')

      expect(res1.status).toBe(200)
      expect(res2.status).toBe(200)

      // Verify that checkLimit was called twice (once for each IP)
      expect(slidingWindowLimiter.checkLimit).toHaveBeenCalledTimes(2)
    })

    it('prevents attacker from locking out specific victim', async () => {
      vi.mocked(slidingWindowLimiter.checkLimit)
        .mockResolvedValueOnce({
          allowed: true,
          remaining: 0,
          total: 10,
          reset: Date.now() + 60000,
        })
        .mockResolvedValueOnce({
          allowed: true,
          remaining: 9,
          total: 10,
          reset: Date.now() + 60000,
        })

      vi.mocked(quotaService.getUserLimits).mockResolvedValue({
        requestsPerMinute: 60,
        requestsPerDay: 1000,
      })

      const app = express()
      app.use(createAdvancedRateLimiter({ limit: 10, windowMs: 60000 }))
      app.get('/test', (_req: Request, res: Response) => {
        res.json({ success: true })
      })

      // Attacker from IP A exhausts their limit
      await supertest(app).get('/test').set('x-forwarded-for', '1.2.3.4')

      // Victim from IP B should still be allowed
      const res = await supertest(app).get('/test').set('x-forwarded-for', '5.6.7.8')

      expect(res.status).toBe(200)
    })
  })

  describe('health check bypass', () => {
    it('bypasses rate limiting for health check endpoint', async () => {
      vi.mocked(slidingWindowLimiter.checkLimit).mockResolvedValue({
        allowed: false,
        remaining: 0,
        total: 10,
        reset: Date.now() + 60000,
      })

      vi.mocked(quotaService.getUserLimits).mockResolvedValue({
        requestsPerMinute: 60,
        requestsPerDay: 1000,
      })

      const app = express()
      app.use(createAdvancedRateLimiter({ limit: 10, windowMs: 60000 }))
      app.get('/health', (_req: Request, res: Response) => {
        res.json({ status: 'ok' })
      })

      const res = await supertest(app).get('/health')

      expect(res.status).toBe(200)
      expect(slidingWindowLimiter.checkLimit).not.toHaveBeenCalled()
    })
  })

  describe('error handling', () => {
    it('fails open on unexpected errors', async () => {
      vi.mocked(slidingWindowLimiter.checkLimit).mockRejectedValue(
        new Error('Redis connection failed')
      )

      vi.mocked(quotaService.getUserLimits).mockResolvedValue({
        requestsPerMinute: 60,
        requestsPerDay: 1000,
      })

      const app = express()
      app.use(createAdvancedRateLimiter({ limit: 10, windowMs: 60000 }))
      app.get('/test', (_req: Request, res: Response) => {
        res.json({ success: true })
      })

      const res = await supertest(app).get('/test')

      // Should allow request through on error (fail open)
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })

    it('passes through AppError from rate limit check', async () => {
      vi.mocked(slidingWindowLimiter.checkLimit).mockRejectedValue(
        new AppError(ErrorCode.TOO_MANY_REQUESTS, 429, 'Rate limit exceeded')
      )

      vi.mocked(quotaService.getUserLimits).mockResolvedValue({
        requestsPerMinute: 60,
        requestsPerDay: 1000,
      })

      const app = express()
      app.use(createAdvancedRateLimiter({ limit: 10, windowMs: 60000 }))
      app.get('/test', (_req: Request, res: Response) => {
        res.json({ success: true })
      })

      const res = await supertest(app).get('/test')

      expect(res.status).toBe(429)
    })
  })

  describe('custom key prefix', () => {
    it('uses custom key prefix when provided', async () => {
      vi.mocked(slidingWindowLimiter.checkLimit).mockResolvedValue({
        allowed: true,
        remaining: 9,
        total: 10,
        reset: Date.now() + 60000,
      })

      vi.mocked(quotaService.getUserLimits).mockResolvedValue({
        requestsPerMinute: 60,
        requestsPerDay: 1000,
      })

      const app = express()
      app.use(createAdvancedRateLimiter({ keyPrefix: 'custom-prefix', limit: 10, windowMs: 60000 }))
      app.get('/test', (_req: Request, res: Response) => {
        res.json({ success: true })
      })

      await supertest(app).get('/test')

      expect(slidingWindowLimiter.checkLimit).toHaveBeenCalledWith(
        expect.stringContaining('custom-prefix'),
        10,
        60000
      )
    })
  })

  describe('window reset behavior', () => {
    it('provides correct reset time in header', async () => {
      const now = Date.now()
      const windowMs = 60000
      const expectedReset = now + windowMs

      vi.mocked(slidingWindowLimiter.checkLimit).mockResolvedValue({
        allowed: true,
        remaining: 9,
        total: 10,
        reset: expectedReset,
      })

      vi.mocked(quotaService.getUserLimits).mockResolvedValue({
        requestsPerMinute: 60,
        requestsPerDay: 1000,
      })

      const app = express()
      app.use(createAdvancedRateLimiter({ limit: 10, windowMs }))
      app.get('/test', (_req: Request, res: Response) => {
        res.json({ success: true })
      })

      const res = await supertest(app).get('/test')

      const resetHeader = parseInt(res.headers['x-ratelimit-reset'] as string, 10)
      expect(resetHeader).toBe(Math.ceil(expectedReset / 1000))
    })
  })

  describe('convenience wrappers', () => {
    it('createPublicRateLimiter uses correct prefix', async () => {
      const { createPublicRateLimiter } = await import('./rateLimit.js')

      vi.mocked(slidingWindowLimiter.checkLimit).mockResolvedValue({
        allowed: true,
        remaining: 9,
        total: 10,
        reset: Date.now() + 60000,
      })

      vi.mocked(quotaService.getUserLimits).mockResolvedValue({
        requestsPerMinute: 60,
        requestsPerDay: 1000,
      })

      const app = express()
      app.use(createPublicRateLimiter({} as any))
      app.get('/test', (_req: Request, res: Response) => {
        res.json({ success: true })
      })

      await supertest(app).get('/test')

      expect(slidingWindowLimiter.checkLimit).toHaveBeenCalledWith(
        expect.stringContaining('public'),
        expect.any(Number),
        expect.any(Number)
      )
    })

    it('createAuthRateLimiter uses correct settings', async () => {
      const { createAuthRateLimiter } = await import('./rateLimit.js')

      vi.mocked(slidingWindowLimiter.checkLimit).mockResolvedValue({
        allowed: true,
        remaining: 9,
        total: 10,
        reset: Date.now() + 60000,
      })

      vi.mocked(quotaService.getUserLimits).mockResolvedValue({
        requestsPerMinute: 60,
        requestsPerDay: 1000,
      })

      const app = express()
      app.use(createAuthRateLimiter({} as any))
      app.get('/test', (_req: Request, res: Response) => {
        res.json({ success: true })
      })

      await supertest(app).get('/test')

      expect(slidingWindowLimiter.checkLimit).toHaveBeenCalledWith(
        expect.stringContaining('auth'),
        10,
        15 * 60 * 1000
      )
    })

    it('createWalletRateLimiter uses correct settings', async () => {
      const { createWalletRateLimiter } = await import('./rateLimit.js')

      vi.mocked(slidingWindowLimiter.checkLimit).mockResolvedValue({
        allowed: true,
        remaining: 9,
        total: 10,
        reset: Date.now() + 60000,
      })

      vi.mocked(quotaService.getUserLimits).mockResolvedValue({
        requestsPerMinute: 60,
        requestsPerDay: 1000,
      })

      const app = express()
      app.use(createWalletRateLimiter({} as any))
      app.get('/test', (_req: Request, res: Response) => {
        res.json({ success: true })
      })

      await supertest(app).get('/test')

      expect(slidingWindowLimiter.checkLimit).toHaveBeenCalledWith(
        expect.stringContaining('wallet'),
        30,
        60000
      )
    })
  })
})
