import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import express, { Request, Response } from 'express'
import supertest from 'supertest'
import { authenticateToken, type AuthenticatedRequest } from './auth.js'
import { errorHandler } from './errorHandler.js'
import { ErrorCode } from '../errors/errorCodes.js'
import { sessionStore, userStore } from '../models/authStore.js'

// Mock dependencies
vi.mock('../utils/logger.js', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

describe('authenticateToken middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    userStore.clear()
    sessionStore.clear()
  })

  afterEach(() => {
    userStore.clear()
    sessionStore.clear()
  })

  it('allows request with valid token and sets user identity', async () => {
    await userStore.getOrCreateByEmail('test@example.com')
    await sessionStore.create('test@example.com', 'valid-token-123')

    const app = express()
    app.use(authenticateToken)
    app.get('/protected', (req: AuthenticatedRequest, res: Response) => {
      res.json({
        success: true,
        user: req.user,
      })
    })
    app.use(errorHandler)

    const res = await supertest(app)
      .get('/protected')
      .set('Authorization', 'Bearer valid-token-123')

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.user).toBeDefined()
    expect(res.body.user.email).toBe('test@example.com')
  })

  it('rejects request with missing authorization header using the unauthorized error', async () => {
    const app = express()
    app.use(authenticateToken)
    app.get('/protected', (_req: Request, res: Response) => {
      res.json({ success: true })
    })
    app.use(errorHandler)

    const res = await supertest(app).get('/protected')

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe(ErrorCode.UNAUTHORIZED)
    expect(res.body.error.message).toBe('Authentication token required')
  })

  it('rejects an expired token using the token-expired error', async () => {
    vi.spyOn(sessionStore, 'getTokenState').mockResolvedValueOnce('expired')

    const app = express()
    app.use(authenticateToken)
    app.get('/protected', (_req: Request, res: Response) => {
      res.json({ success: true })
    })
    app.use(errorHandler)

    const res = await supertest(app)
      .get('/protected')
      .set('Authorization', 'Bearer expired-token')

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe(ErrorCode.TOKEN_EXPIRED)
    expect(res.body.error.message).toBe('Access token expired')
  })

  it('rejects request with invalid token using the invalid-token error', async () => {
    const app = express()
    app.use(authenticateToken)
    app.get('/protected', (_req: Request, res: Response) => {
      res.json({ success: true })
    })
    app.use(errorHandler)

    const res = await supertest(app)
      .get('/protected')
      .set('Authorization', 'Bearer invalid-token')

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe(ErrorCode.INVALID_TOKEN)
    expect(res.body.error.message).toBe('Invalid token')
  })

  it('rejects a valid session when its user no longer exists', async () => {
    await sessionStore.create('deleted@example.com', 'orphaned-session-token')

    const app = express()
    app.use(authenticateToken)
    app.get('/protected', (_req: Request, res: Response) => {
      res.json({ success: true })
    })
    app.use(errorHandler)

    const res = await supertest(app)
      .get('/protected')
      .set('Authorization', 'Bearer orphaned-session-token')

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe(ErrorCode.UNAUTHORIZED)
    expect(res.body.error.message).toBe('User not found')
  })

  it('rejects request when token verification throws error (fail closed)', async () => {
    vi.spyOn(sessionStore, 'getTokenState').mockImplementationOnce(() => {
      throw new Error('Database connection failed')
    })

    const app = express()
    app.use(authenticateToken)
    app.get('/protected', (_req: Request, res: Response) => {
      res.json({ success: true })
    })
    app.use(errorHandler)

    const res = await supertest(app)
      .get('/protected')
      .set('Authorization', 'Bearer some-token')

    expect(res.status).toBeGreaterThan(399)
  })
})
