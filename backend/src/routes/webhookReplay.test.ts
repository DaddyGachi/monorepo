import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express, { type Express } from 'express'
import { errorHandler } from '../middleware/errorHandler.js'
import { createWebhookReplayRouter } from './webhookReplay.js'
import { InMemoryWebhookReplayStore } from '../webhookReplay/store.js'
import { WebhookReplayService, initWebhookReplayService } from '../webhookReplay/webhookReplayService.js'
import { WebhookProcessingStatus, type WebhookEvent } from '../webhookReplay/types.js'

const ADMIN_SECRET = vi.hoisted(() => 'test-secret')

const scheduleMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

const authState = vi.hoisted(() => ({
  mode: 'admin' as 'admin' | 'no-token' | 'no-user',
  user: {
    id: 'admin-user-1',
    email: 'admin@example.com',
    name: 'Admin',
    role: 'admin' as string,
  },
}))

vi.mock('../schemas/env.js', () => ({
  env: { MANUAL_ADMIN_SECRET: ADMIN_SECRET },
}))

vi.mock('../jobs/scheduler/worker.js', () => ({
  getScheduler: vi.fn(() => ({ schedule: scheduleMock })),
}))

vi.mock('../utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))

vi.mock('../utils/auditLogger.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../utils/auditLogger.js')>()
  return { ...original, auditLog: vi.fn() }
})

// authenticateToken is stubbed so each test can drive it into one of three states:
// a resolved admin session, a missing/invalid token (401 from the middleware itself),
// or a session that resolves with no user attached (exercises the route's own guard).
vi.mock('../middleware/auth.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../middleware/auth.js')>()
  const { AppError } = await import('../errors/AppError.js')
  const { ErrorCode } = await import('../errors/errorCodes.js')
  return {
    ...original,
    authenticateToken: (req: any, _res: any, next: any) => {
      if (authState.mode === 'no-token') {
        next(new AppError(ErrorCode.UNAUTHORIZED, 401, 'Authentication token required'))
        return
      }
      if (authState.mode === 'no-user') {
        next()
        return
      }
      req.user = authState.user
      next()
    },
  }
})

function buildApp(): Express {
  const app = express()
  app.use(express.json())
  app.use((req: any, _res, next) => {
    req.requestId = 'test-request-id'
    next()
  })
  app.use('/api/admin/webhook-replay', createWebhookReplayRouter())
  app.use(errorHandler)
  return app
}

function makeEventInput(overrides: Partial<Omit<WebhookEvent, 'id' | 'receivedAt'>> = {}) {
  return {
    provider: 'paystack',
    eventType: 'charge.success',
    externalId: `ext-${Math.random().toString(36).slice(2)}`,
    payload: { amount: 5000, currency: 'NGN' },
    processingStatus: WebhookProcessingStatus.PENDING,
    ...overrides,
  }
}

describe('Webhook Replay Routes', () => {
  let store: InMemoryWebhookReplayStore

  beforeEach(() => {
    store = new InMemoryWebhookReplayStore()
    initWebhookReplayService(new WebhookReplayService(store))
    authState.mode = 'admin'
    authState.user = { id: 'admin-user-1', email: 'admin@example.com', name: 'Admin', role: 'admin' }
    scheduleMock.mockClear()
  })

  // ---------------------------------------------------------------------------
  // POST /preview
  // ---------------------------------------------------------------------------
  describe('POST /preview', () => {
    it('returns matching events for the given filters', async () => {
      await store.createEvent(makeEventInput({ provider: 'paystack', externalId: 'ps-1' }))
      await store.createEvent(makeEventInput({ provider: 'flutterwave', externalId: 'fw-1' }))

      const res = await request(buildApp())
        .post('/api/admin/webhook-replay/preview')
        .set('x-admin-secret', ADMIN_SECRET)
        .send({ provider: 'paystack', dryRun: true, reason: 'investigate charge mismatch' })

      expect(res.status).toBe(200)
      expect(res.body.totalEvents).toBe(1)
      expect(res.body.events[0].provider).toBe('paystack')
    })

    it('never schedules replay jobs or records a replay attempt (true dry-run), even when dryRun is false in the body', async () => {
      await store.createEvent(makeEventInput({ provider: 'paystack', externalId: 'ps-preview-1' }))

      const res = await request(buildApp())
        .post('/api/admin/webhook-replay/preview')
        .set('x-admin-secret', ADMIN_SECRET)
        .send({ provider: 'paystack', dryRun: false, reason: 'preview only' })

      expect(res.status).toBe(200)
      expect(scheduleMock).not.toHaveBeenCalled()

      const history = await store.listReplayAttempts()
      expect(history).toHaveLength(0)
    })

    it('rejects an unauthenticated request', async () => {
      authState.mode = 'no-token'

      const res = await request(buildApp())
        .post('/api/admin/webhook-replay/preview')
        .set('x-admin-secret', ADMIN_SECRET)
        .send({ dryRun: true, reason: 'test' })

      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('UNAUTHORIZED')
    })

    it('returns 401 when the session resolves without a user attached', async () => {
      authState.mode = 'no-user'

      const res = await request(buildApp())
        .post('/api/admin/webhook-replay/preview')
        .set('x-admin-secret', ADMIN_SECRET)
        .send({ dryRun: true, reason: 'test' })

      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('UNAUTHORIZED')
      expect(res.body.error.message).toBe('Authentication required')
    })

    it('rejects a request with no admin secret header, even for an authenticated non-admin role', async () => {
      authState.user = { id: 'user-1', email: 'tenant@example.com', name: 'Tenant', role: 'tenant' }

      const res = await request(buildApp())
        .post('/api/admin/webhook-replay/preview')
        .send({ dryRun: true, reason: 'test' })

      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe('FORBIDDEN')
    })

    it('rejects a request with an invalid admin secret', async () => {
      const res = await request(buildApp())
        .post('/api/admin/webhook-replay/preview')
        .set('x-admin-secret', 'wrong-secret')
        .send({ dryRun: true, reason: 'test' })

      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe('FORBIDDEN')
    })

    it('rejects a request missing the required reason field', async () => {
      const res = await request(buildApp())
        .post('/api/admin/webhook-replay/preview')
        .set('x-admin-secret', ADMIN_SECRET)
        .send({ dryRun: true })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('rejects a request missing the required dryRun field', async () => {
      const res = await request(buildApp())
        .post('/api/admin/webhook-replay/preview')
        .set('x-admin-secret', ADMIN_SECRET)
        .send({ reason: 'test' })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('rejects a request where dryRun is not a boolean', async () => {
      const res = await request(buildApp())
        .post('/api/admin/webhook-replay/preview')
        .set('x-admin-secret', ADMIN_SECRET)
        .send({ dryRun: 'true', reason: 'test' })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('rejects a request with a non-uuid webhookEventId', async () => {
      const res = await request(buildApp())
        .post('/api/admin/webhook-replay/preview')
        .set('x-admin-secret', ADMIN_SECRET)
        .send({ webhookEventId: 'not-a-uuid', dryRun: true, reason: 'test' })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('rejects a request with a malformed startTime', async () => {
      const res = await request(buildApp())
        .post('/api/admin/webhook-replay/preview')
        .set('x-admin-secret', ADMIN_SECRET)
        .send({ startTime: 'not-a-date', dryRun: true, reason: 'test' })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })
  })

  // ---------------------------------------------------------------------------
  // POST /execute
  // ---------------------------------------------------------------------------
  describe('POST /execute', () => {
    it('performs a dry run without scheduling any replay job', async () => {
      const event = await store.createEvent(
        makeEventInput({ provider: 'exec-dry-provider', externalId: 'exec-dry-1' })
      )

      const res = await request(buildApp())
        .post('/api/admin/webhook-replay/execute')
        .set('x-admin-secret', ADMIN_SECRET)
        .send({ provider: event.provider, dryRun: true, reason: 'dry run check' })

      expect(res.status).toBe(201)
      expect(res.body.status).toBe('success')
      expect(res.body.dryRun).toBe(true)
      expect(res.body.webhookEventId).toBe(event.id)
      expect(scheduleMock).not.toHaveBeenCalled()
    })

    it('schedules exactly one replay job per matched event on a real execute', async () => {
      const event = await store.createEvent(
        makeEventInput({ provider: 'exec-real-provider', externalId: 'exec-real-1' })
      )

      const res = await request(buildApp())
        .post('/api/admin/webhook-replay/execute')
        .set('x-admin-secret', ADMIN_SECRET)
        .send({ provider: event.provider, dryRun: false, reason: 'replay this charge' })

      expect(res.status).toBe(201)
      expect(res.body.status).toBe('success')
      expect(res.body.dryRun).toBe(false)
      expect(scheduleMock).toHaveBeenCalledTimes(1)
      expect(scheduleMock).toHaveBeenCalledWith(
        expect.objectContaining({
          handler: 'webhook.replay',
          payload: expect.objectContaining({ webhookEventId: event.id }),
        })
      )
    })

    it('rejects an unauthenticated request', async () => {
      authState.mode = 'no-token'

      const res = await request(buildApp())
        .post('/api/admin/webhook-replay/execute')
        .set('x-admin-secret', ADMIN_SECRET)
        .send({ dryRun: false, reason: 'test' })

      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('UNAUTHORIZED')
      expect(scheduleMock).not.toHaveBeenCalled()
    })

    it('returns 401 when the session resolves without a user attached', async () => {
      authState.mode = 'no-user'

      const res = await request(buildApp())
        .post('/api/admin/webhook-replay/execute')
        .set('x-admin-secret', ADMIN_SECRET)
        .send({ dryRun: false, reason: 'test' })

      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('UNAUTHORIZED')
    })

    it('rejects a request with no admin secret header, even for an authenticated non-admin role', async () => {
      authState.user = { id: 'user-1', email: 'tenant@example.com', name: 'Tenant', role: 'tenant' }

      const res = await request(buildApp())
        .post('/api/admin/webhook-replay/execute')
        .send({ dryRun: false, reason: 'test' })

      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe('FORBIDDEN')
      expect(scheduleMock).not.toHaveBeenCalled()
    })

    it('rejects a request with an invalid admin secret', async () => {
      const res = await request(buildApp())
        .post('/api/admin/webhook-replay/execute')
        .set('x-admin-secret', 'wrong-secret')
        .send({ dryRun: false, reason: 'test' })

      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe('FORBIDDEN')
      expect(scheduleMock).not.toHaveBeenCalled()
    })

    it('rejects a request missing the required reason field', async () => {
      const res = await request(buildApp())
        .post('/api/admin/webhook-replay/execute')
        .set('x-admin-secret', ADMIN_SECRET)
        .send({ dryRun: false })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('rejects a request missing the required dryRun field', async () => {
      const res = await request(buildApp())
        .post('/api/admin/webhook-replay/execute')
        .set('x-admin-secret', ADMIN_SECRET)
        .send({ reason: 'test' })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('rejects a request with a non-uuid webhookEventId', async () => {
      const res = await request(buildApp())
        .post('/api/admin/webhook-replay/execute')
        .set('x-admin-secret', ADMIN_SECRET)
        .send({ webhookEventId: 'not-a-uuid', dryRun: false, reason: 'test' })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('surfaces an error when no events match the replay criteria', async () => {
      const res = await request(buildApp())
        .post('/api/admin/webhook-replay/execute')
        .set('x-admin-secret', ADMIN_SECRET)
        .send({ provider: 'nonexistent-provider', dryRun: false, reason: 'test' })

      expect(res.status).toBe(500)
      expect(res.body.error.message).toBe('No events found matching the replay criteria')
      expect(scheduleMock).not.toHaveBeenCalled()
    })

    // NOTE: this documents a real bug found while adding coverage for this route,
    // rather than fixing it silently in a test-only PR — see PR description.
    //
    // WebhookReplayService.executeReplay() (backend/src/webhookReplay/webhookReplayService.ts)
    // never checks WebhookEvent.processingStatus before scheduling a replay job. Replaying
    // a webhookEventId that has already reached WebhookProcessingStatus.PROCESSED still
    // unconditionally calls scheduler.schedule(...) again, which re-triggers whatever
    // side effect the original webhook caused (payment status updates, KYC state changes,
    // etc.) a second time. This test is skipped because it currently fails against that
    // behavior; un-skip it once executeReplay gains an idempotency guard for already-processed
    // events.
    it.skip('does not schedule a replay job for a webhook event that has already been processed', async () => {
      const event = await store.createEvent(
        makeEventInput({
          provider: 'already-processed-provider',
          externalId: 'already-processed-1',
          processingStatus: WebhookProcessingStatus.PROCESSED,
        })
      )

      const res = await request(buildApp())
        .post('/api/admin/webhook-replay/execute')
        .set('x-admin-secret', ADMIN_SECRET)
        .send({ provider: event.provider, dryRun: false, reason: 'accidental re-replay' })

      expect(res.status).toBe(201)
      expect(scheduleMock).not.toHaveBeenCalled()
    })
  })

  // ---------------------------------------------------------------------------
  // GET /history
  // ---------------------------------------------------------------------------
  describe('GET /history', () => {
    it('returns recorded replay attempts', async () => {
      const event = await store.createEvent(
        makeEventInput({ provider: 'hist-provider', externalId: 'hist-1' })
      )

      await request(buildApp())
        .post('/api/admin/webhook-replay/execute')
        .set('x-admin-secret', ADMIN_SECRET)
        .send({ provider: event.provider, dryRun: true, reason: 'seed history' })

      const res = await request(buildApp())
        .get('/api/admin/webhook-replay/history')
        .set('x-admin-secret', ADMIN_SECRET)

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body)).toBe(true)
      expect(res.body).toHaveLength(1)
      expect(res.body[0].webhookEventId).toBe(event.id)
    })

    it('filters history by webhookEventId', async () => {
      const eventA = await store.createEvent(
        makeEventInput({ provider: 'hist-a-provider', externalId: 'hist-a' })
      )
      const eventB = await store.createEvent(
        makeEventInput({ provider: 'hist-b-provider', externalId: 'hist-b' })
      )

      const app = buildApp()
      await request(app)
        .post('/api/admin/webhook-replay/execute')
        .set('x-admin-secret', ADMIN_SECRET)
        .send({ provider: eventA.provider, dryRun: true, reason: 'seed a' })
      await request(app)
        .post('/api/admin/webhook-replay/execute')
        .set('x-admin-secret', ADMIN_SECRET)
        .send({ provider: eventB.provider, dryRun: true, reason: 'seed b' })

      const res = await request(app)
        .get(`/api/admin/webhook-replay/history?webhookEventId=${eventA.id}`)
        .set('x-admin-secret', ADMIN_SECRET)

      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(1)
      expect(res.body[0].webhookEventId).toBe(eventA.id)
    })

    it('rejects an unauthenticated request', async () => {
      authState.mode = 'no-token'

      const res = await request(buildApp())
        .get('/api/admin/webhook-replay/history')
        .set('x-admin-secret', ADMIN_SECRET)

      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('UNAUTHORIZED')
    })

    it('rejects a request with no admin secret header', async () => {
      const res = await request(buildApp()).get('/api/admin/webhook-replay/history')

      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe('FORBIDDEN')
    })

    it('rejects a request with an invalid admin secret', async () => {
      const res = await request(buildApp())
        .get('/api/admin/webhook-replay/history')
        .set('x-admin-secret', 'wrong-secret')

      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe('FORBIDDEN')
    })
  })

  // ---------------------------------------------------------------------------
  // GET /events/:id
  // ---------------------------------------------------------------------------
  describe('GET /events/:id', () => {
    it('returns the webhook event by id', async () => {
      const event = await store.createEvent(makeEventInput({ externalId: 'get-1' }))

      const res = await request(buildApp())
        .get(`/api/admin/webhook-replay/events/${event.id}`)
        .set('x-admin-secret', ADMIN_SECRET)

      expect(res.status).toBe(200)
      expect(res.body.id).toBe(event.id)
      expect(res.body.provider).toBe('paystack')
    })

    it('returns 404 for an unknown event id', async () => {
      const res = await request(buildApp())
        .get('/api/admin/webhook-replay/events/does-not-exist')
        .set('x-admin-secret', ADMIN_SECRET)

      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe('NOT_FOUND')
    })

    it('rejects an unauthenticated request', async () => {
      authState.mode = 'no-token'

      const res = await request(buildApp())
        .get('/api/admin/webhook-replay/events/some-id')
        .set('x-admin-secret', ADMIN_SECRET)

      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('UNAUTHORIZED')
    })

    it('rejects a request with no admin secret header', async () => {
      const res = await request(buildApp()).get('/api/admin/webhook-replay/events/some-id')

      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe('FORBIDDEN')
    })

    it('rejects a request with an invalid admin secret', async () => {
      const res = await request(buildApp())
        .get('/api/admin/webhook-replay/events/some-id')
        .set('x-admin-secret', 'wrong-secret')

      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe('FORBIDDEN')
    })
  })
})
