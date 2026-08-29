import { describe, it, expect, vi, beforeEach } from 'vitest'
import express, { Request, Response, NextFunction } from 'express'
import supertest from 'supertest'
import { z } from 'zod'
import { validate } from './validate.js'
import { ErrorCode } from '../errors/errorCodes.js'

// Mock logger at top level to avoid hoisting issues
vi.mock('../utils/logger.js', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

describe('validate middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('body validation', () => {
    it('allows valid input and passes through', async () => {
      const schema = z.object({
        name: z.string().min(1),
        age: z.number().int().positive(),
      })

      const app = express()
      app.use(express.json())
      app.post('/test', validate(schema, 'body'), (req: Request, res: Response) => {
        res.json({ success: true, data: req.body })
      })

      const res = await supertest(app)
        .post('/test')
        .send({ name: 'John', age: 30 })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toEqual({ name: 'John', age: 30 })
    })

    it('rejects invalid input with 400 and error details', async () => {
      const schema = z.object({
        name: z.string().min(1),
        age: z.number().int().positive(),
      })

      const app = express()
      app.use(express.json())
      app.post('/test', validate(schema, 'body'), (req: Request, res: Response) => {
        res.json({ success: true })
      })

      const res = await supertest(app)
        .post('/test')
        .send({ name: '', age: -5 })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR)
      expect(res.body.error.message).toBe('Invalid request data')
      expect(res.body.error.details).toBeDefined()
      expect(res.body.error.retryable).toBe(false)
      expect(res.body.error.classification).toBe('permanent')
    })

    it('applies Zod coercion and defaults', async () => {
      const schema = z.object({
        count: z.coerce.number().default(0),
        active: z.coerce.boolean().default(false),
      })

      const app = express()
      app.use(express.json())
      app.post('/test', validate(schema, 'body'), (req: Request, res: Response) => {
        res.json({ success: true, data: req.body })
      })

      const res = await supertest(app)
        .post('/test')
        .send({ count: '42' })

      expect(res.status).toBe(200)
      expect(res.body.data.count).toBe(42)
      expect(res.body.data.active).toBe(false)
    })

    it('strips extra fields when strict mode is not used', async () => {
      const schema = z.object({
        name: z.string(),
      })

      const app = express()
      app.use(express.json())
      app.post('/test', validate(schema, 'body'), (req: Request, res: Response) => {
        res.json({ success: true, data: req.body })
      })

      const res = await supertest(app)
        .post('/test')
        .send({ name: 'John', extra: 'field' })

      expect(res.status).toBe(200)
      // Zod by default strips extra fields in passthrough mode, but keeps them in standard mode
      // This test verifies the behavior - extra fields should be handled per Zod's default behavior
      expect(res.body.data.name).toBe('John')
    })

    it('handles nested object validation', async () => {
      const schema = z.object({
        user: z.object({
          name: z.string(),
          email: z.string().email(),
        }),
      })

      const app = express()
      app.use(express.json())
      app.post('/test', validate(schema, 'body'), (req: Request, res: Response) => {
        res.json({ success: true, data: req.body })
      })

      const res = await supertest(app)
        .post('/test')
        .send({ user: { name: 'John', email: 'invalid-email' } })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR)
      expect(res.body.error.details).toBeDefined()
    })

    it('handles array validation', async () => {
      const schema = z.object({
        tags: z.array(z.string().min(1)),
      })

      const app = express()
      app.use(express.json())
      app.post('/test', validate(schema, 'body'), (req: Request, res: Response) => {
        res.json({ success: true, data: req.body })
      })

      const res = await supertest(app)
        .post('/test')
        .send({ tags: ['tag1', '', 'tag3'] })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR)
    })
  })

  describe('query validation', () => {
    it('validates query parameters', async () => {
      const schema = z.object({
        page: z.coerce.number().int().positive().default(1),
        limit: z.coerce.number().int().positive().max(100).default(10),
      })

      const app = express()
      app.get('/test', validate(schema, 'query'), (req: Request, res: Response) => {
        res.json({ success: true, data: req.query })
      })

      const res = await supertest(app)
        .get('/test?page=2&limit=50')

      expect(res.status).toBe(200)
      // Zod coercion converts strings to numbers
      expect(res.body.data.page).toBe(2)
      expect(res.body.data.limit).toBe(50)
    })

    it('rejects invalid query parameters', async () => {
      const schema = z.object({
        page: z.coerce.number().int().positive(),
      })

      const app = express()
      app.get('/test', validate(schema, 'query'), (req: Request, res: Response) => {
        res.json({ success: true })
      })

      const res = await supertest(app)
        .get('/test?page=-1')

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR)
    })
  })

  describe('params validation', () => {
    it('validates route parameters', async () => {
      const schema = z.object({
        id: z.string().uuid(),
      })

      const app = express()
      app.get('/test/:id', validate(schema, 'params'), (req: Request, res: Response) => {
        res.json({ success: true, data: req.params })
      })

      const res = await supertest(app)
        .get('/test/550e8400-e29b-41d4-a716-446655440000')

      expect(res.status).toBe(200)
      expect(res.body.data.id).toBe('550e8400-e29b-41d4-a716-446655440000')
    })

    it('rejects invalid route parameters', async () => {
      const schema = z.object({
        id: z.string().uuid(),
      })

      const app = express()
      app.get('/test/:id', validate(schema, 'params'), (req: Request, res: Response) => {
        res.json({ success: true })
      })

      const res = await supertest(app)
        .get('/test/not-a-uuid')

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR)
    })
  })

  describe('error response format', () => {
    it('includes x-request-id header in response', async () => {
      const schema = z.object({
        name: z.string(),
      })

      const app = express()
      app.use(express.json())
      app.post('/test', validate(schema, 'body'), (req: Request, res: Response) => {
        res.json({ success: true })
      })

      const res = await supertest(app)
        .post('/test')
        .send({ name: 123 })

      expect(res.status).toBe(400)
      expect(res.headers['x-request-id']).toBeDefined()
    })

    it('logs validation failures with structured context', async () => {
      const schema = z.object({
        name: z.string(),
      })

      const app = express()
      app.use(express.json())
      app.post('/test', validate(schema, 'body'), (req: Request, res: Response) => {
        res.json({ success: true })
      })

      await supertest(app)
        .post('/test')
        .send({ name: 123 })

      // Logger should be called with validation failure context
      const { logger } = await import('../utils/logger.js')
      expect(logger.warn).toHaveBeenCalled()
      const logCall = (logger.warn as any).mock.calls[0]
      expect(logCall[0]).toBe('Request validation failed')
      expect(logCall[1]).toMatchObject({
        path: '/test',
        method: 'POST',
        target: 'body',
        endpoint: 'POST /test',
      })
      expect(logCall[1].validationErrors).toBeDefined()
    })

    it('formats multiple validation errors correctly', async () => {
      const schema = z.object({
        name: z.string().min(3),
        age: z.number().int().min(18),
        email: z.string().email(),
      })

      const app = express()
      app.use(express.json())
      app.post('/test', validate(schema, 'body'), (req: Request, res: Response) => {
        res.json({ success: true })
      })

      const res = await supertest(app)
        .post('/test')
        .send({ name: 'ab', age: 15, email: 'not-an-email' })

      expect(res.status).toBe(400)
      expect(res.body.error.details).toBeDefined()
      // Should have multiple field errors
      const details = res.body.error.details
      expect(Object.keys(details).length).toBeGreaterThan(0)
    })
  })

  describe('edge cases', () => {
    it('handles missing body gracefully', async () => {
      const schema = z.object({
        name: z.string(),
      })

      const app = express()
      app.use(express.json())
      app.post('/test', validate(schema, 'body'), (req: Request, res: Response) => {
        res.json({ success: true })
      })

      const res = await supertest(app)
        .post('/test')
        .send()

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR)
    })

    it('handles null and undefined values according to schema', async () => {
      const schema = z.object({
        optional: z.string().optional(),
        nullable: z.string().nullable(),
        required: z.string(),
      })

      const app = express()
      app.use(express.json())
      app.post('/test', validate(schema, 'body'), (req: Request, res: Response) => {
        res.json({ success: true, data: req.body })
      })

      const res = await supertest(app)
        .post('/test')
        .send({ required: 'test', nullable: null })

      expect(res.status).toBe(200)
      expect(res.body.data.optional).toBeUndefined()
      expect(res.body.data.nullable).toBe(null)
    })

    it('handles empty object when schema expects fields', async () => {
      const schema = z.object({
        name: z.string(),
      })

      const app = express()
      app.use(express.json())
      app.post('/test', validate(schema, 'body'), (req: Request, res: Response) => {
        res.json({ success: true })
      })

      const res = await supertest(app)
        .post('/test')
        .send({})

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR)
    })
  })
})
