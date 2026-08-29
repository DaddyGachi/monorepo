import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import express, { Request, Response, NextFunction } from 'express'
import supertest from 'supertest'
import { requirePermission } from './rbac.js'
import type { AuthenticatedRequest } from './auth.js'
import { getPool } from '../db.js'

// Mock dependencies
vi.mock('../db.js', () => ({
  getPool: vi.fn(),
}))

vi.mock('../utils/logger.js', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

describe('requirePermission middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('rejects unauthenticated requests', async () => {
    const app = express()
    app.get('/protected', requirePermission('property', 'create') as any, (_req: Request, res: Response) => {
      res.json({ success: true })
    })

    const res = await supertest(app).get('/protected')

    expect(res.status).toBe(401)
  })

  it('allows user with correct permission', async () => {
    const app = express()
    
    app.get('/protected', (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
      ;(req as any).isSuperAdmin = false
      ;(req as any).permissions = ['property:create']
      req.user = { id: 'user-123', email: 'test@example.com', name: 'Test', role: 'tenant' }
      next()
    }, requirePermission('property', 'create') as any, (_req: Request, res: Response) => {
      res.json({ success: true })
    })

    const res = await supertest(app).get('/protected')

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it('rejects user with wrong permission', async () => {
    const app = express()
    
    app.get('/protected', (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
      ;(req as any).isSuperAdmin = false
      ;(req as any).permissions = ['property:read']
      req.user = { id: 'user-123', email: 'test@example.com', name: 'Test', role: 'tenant' }
      next()
    }, requirePermission('property', 'create') as any, (_req: Request, res: Response) => {
      res.json({ success: true })
    })

    const res = await supertest(app).get('/protected')

    expect(res.status).toBe(403)
  })

  it('allows super_admin without specific permission check', async () => {
    const app = express()
    
    app.get('/protected', (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
      ;(req as any).isSuperAdmin = true
      ;(req as any).permissions = []
      req.user = { id: 'admin-123', email: 'admin@example.com', name: 'Admin', role: 'super_admin' }
      next()
    }, requirePermission('property', 'create') as any, (_req: Request, res: Response) => {
      res.json({ success: true })
    })

    const res = await supertest(app).get('/protected')

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it('allows admin role when DB is unavailable (fallback)', async () => {
    vi.mocked(getPool).mockResolvedValue(null)

    const app = express()
    
    app.get('/protected', (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
      req.user = { id: 'admin-123', email: 'admin@example.com', name: 'Admin', role: 'admin' }
      next()
    }, requirePermission('property', 'create') as any, (_req: Request, res: Response) => {
      res.json({ success: true })
    })

    const res = await supertest(app).get('/protected')

    expect(res.status).toBe(200)
  })

  it('rejects non-admin when DB is unavailable (fallback)', async () => {
    vi.mocked(getPool).mockResolvedValue(null)

    const app = express()
    
    app.get('/protected', (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
      req.user = { id: 'user-123', email: 'test@example.com', name: 'Test', role: 'tenant' }
      next()
    }, requirePermission('property', 'create') as any, (_req: Request, res: Response) => {
      res.json({ success: true })
    })

    const res = await supertest(app).get('/protected')

    expect(res.status).toBe(403)
  })
})
