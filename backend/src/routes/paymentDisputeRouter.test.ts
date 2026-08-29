import { describe, it, expect, beforeEach, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import { v4 as randomUUID } from 'uuid'
import { createPaymentDisputeRouter } from './paymentDispute.js'
import { errorHandler } from '../middleware/errorHandler.js'
import { requestIdMiddleware } from '../middleware/requestId.js'
import { sessionStore, userStore } from '../models/authStore.js'

/**
 * IMPORTANT CONTEXT (see PR description for the full write-up):
 *
 * This file is named paymentDisputeRouter.test.ts rather than
 * paymentDispute.test.ts because that path was already taken by another,
 * unrelated PR (closing #1397/#1398/#1399) that added its own
 * routes/paymentDispute.test.ts covering GET/POST /api/tenant/payments/disputes
 * in tenantPayments.ts. That file is a different (and much shallower) set of
 * tests — it only covers auth/validation rejection and a generic "500 when DB
 * unavailable" case, using the real (unmocked) repository. This file uses
 * vi.mock() on PaymentDisputeRepository, which is scoped per test file in
 * Vitest, so it cannot safely share a file with tests that depend on the
 * repository being unmocked — hence the separate file rather than merging the
 * two.
 *
 * createPaymentDisputeRouter() (the router this file actually tests) is never
 * mounted in app.ts — these endpoints are unreachable in the running
 * application today. The live dispute flow users actually hit is
 * GET/POST /api/tenant/payments/disputes in tenantPayments.ts (see the other
 * file), which has no duplicate-pending guard and, critically, has no resolve
 * endpoint at all — there is currently no reachable route anywhere in the app
 * that resolves a dispute.
 *
 * These tests exercise the code in paymentDispute.ts as written (per the
 * issue), driving every transition through the HTTP endpoints. Several of them
 * intentionally document gaps rather than asserting protections the code does
 * not implement:
 *   - POST / never checks that the caller is a party to the payment.
 *   - POST / never checks that the payment exists or isn't already settled —
 *     only that there isn't already a *pending* dispute for the same paymentId.
 *   - The schema defines an `under_review` status but no route ever
 *     transitions a dispute into it; the real lifecycle here is
 *     pending -> resolved|rejected directly.
 *   - POST /admin/:disputeId/resolve never checks the dispute's current
 *     status before resolving, and the repository's updateStatus is an
 *     unconditional UPDATE — so resolving an already-resolved/rejected
 *     dispute is not rejected (no illegal-transition guard).
 */

type DisputeStatus = 'pending' | 'under_review' | 'resolved' | 'rejected'

interface FakeDispute {
  id: string
  userId: string
  paymentId: string
  dealId: string | null
  reason: string
  description: string
  evidenceKeys: string[]
  status: DisputeStatus
  resolution: string | null
  resolvedBy: string | null
  createdAt: Date
  updatedAt: Date
}

const { disputes } = vi.hoisted(() => ({
  disputes: new Map<string, FakeDispute>(),
}))

vi.mock('../repositories/PaymentDisputeRepository.js', () => ({
  paymentDisputeRepository: {
    create: vi.fn(async (userId: string, data: any) => {
      const dispute: FakeDispute = {
        id: randomUUID(),
        userId,
        paymentId: data.paymentId,
        dealId: data.dealId ?? null,
        reason: data.reason,
        description: data.description,
        evidenceKeys: data.evidenceKeys ?? [],
        status: 'pending',
        resolution: null,
        resolvedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      disputes.set(dispute.id, dispute)
      return dispute
    }),
    findById: vi.fn(async (id: string) => disputes.get(id) ?? null),
    findByPaymentId: vi.fn(async (paymentId: string) =>
      [...disputes.values()].filter((d) => d.paymentId === paymentId),
    ),
    findByUserId: vi.fn(async (userId: string) =>
      [...disputes.values()].filter((d) => d.userId === userId),
    ),
    updateStatus: vi.fn(async (id: string, status: DisputeStatus, resolution?: string, resolvedBy?: string) => {
      const dispute = disputes.get(id)
      if (!dispute) throw new Error('Dispute not found')
      dispute.status = status
      dispute.resolution = resolution ?? null
      dispute.resolvedBy = resolvedBy ?? null
      dispute.updatedAt = new Date()
      return dispute
    }),
    list: vi.fn(async (filter?: { status?: DisputeStatus; userId?: string; page?: number; pageSize?: number }) => {
      let items = [...disputes.values()]
      if (filter?.status) items = items.filter((d) => d.status === filter.status)
      if (filter?.userId) items = items.filter((d) => d.userId === filter.userId)
      return {
        disputes: items,
        total: items.length,
        page: filter?.page ?? 1,
        pageSize: filter?.pageSize ?? 50,
        totalPages: 1,
      }
    }),
  },
}))

function buildApp(): express.Express {
  const app = express()
  app.use(requestIdMiddleware)
  app.use(express.json())
  app.use('/api/payments/disputes', createPaymentDisputeRouter())
  app.use(errorHandler)
  return app
}

describe('Payment Dispute Routes', () => {
  let app: express.Express
  let tenantId: string
  let tenantToken: string
  let otherUserId: string
  let otherUserToken: string
  let adminId: string
  let adminToken: string

  const validCreatePayload = () => ({
    paymentId: randomUUID(),
    dealId: 'deal-1',
    reason: 'amount_discrepancy' as const,
    description: 'The charged amount does not match the agreed rent for this period.',
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    disputes.clear()
    sessionStore.clear()
    userStore.clear()
    app = buildApp()

    const tenant = await userStore.getOrCreateByEmail('dispute-tenant@example.com')
    tenantId = tenant.id
    tenantToken = 'test-token-dispute-tenant'
    await sessionStore.create(tenant.email, tenantToken)

    const otherUser = await userStore.getOrCreateByEmail('dispute-bystander@example.com')
    otherUserId = otherUser.id
    otherUserToken = 'test-token-dispute-bystander'
    await sessionStore.create(otherUser.email, otherUserToken)

    const admin = await userStore.getOrCreateByEmail('dispute-admin@example.com')
    adminId = admin.id
    admin.role = 'admin' // Legacy/test fallback for in-memory store (see adminWithdrawals.test.ts)
    adminToken = 'test-token-dispute-admin'
    await sessionStore.create(admin.email, adminToken)
  })

  describe('POST /api/payments/disputes (open)', () => {
    it('rejects unauthenticated requests', async () => {
      const res = await request(app).post('/api/payments/disputes').send(validCreatePayload())
      expect(res.status).toBe(401)
    })

    it('opens a dispute for an authenticated user, defaulting to pending status', async () => {
      const payload = validCreatePayload()
      const res = await request(app)
        .post('/api/payments/disputes')
        .set('Authorization', `Bearer ${tenantToken}`)
        .send(payload)
        .expect(201)

      expect(res.body.success).toBe(true)
      expect(res.body.disputeId).toBeDefined()

      const stored = disputes.get(res.body.disputeId)
      expect(stored?.status).toBe('pending')
      expect(stored?.userId).toBe(tenantId)
      expect(stored?.paymentId).toBe(payload.paymentId)
    })

    it('rejects malformed dispute data (400 validation error)', async () => {
      const res = await request(app)
        .post('/api/payments/disputes')
        .set('Authorization', `Bearer ${tenantToken}`)
        .send({ paymentId: 'not-a-uuid', reason: 'amount_discrepancy', description: 'too short' })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('rejects opening a second dispute while one is already pending for the same payment', async () => {
      const payload = validCreatePayload()
      await request(app)
        .post('/api/payments/disputes')
        .set('Authorization', `Bearer ${tenantToken}`)
        .send(payload)
        .expect(201)

      const res = await request(app)
        .post('/api/payments/disputes')
        .set('Authorization', `Bearer ${otherUserToken}`)
        .send(payload)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
      expect(res.body.error.message).toMatch(/already pending/i)
    })

    it('allows opening a new dispute for a payment whose prior dispute was already resolved', async () => {
      const payload = validCreatePayload()
      const first = await request(app)
        .post('/api/payments/disputes')
        .set('Authorization', `Bearer ${tenantToken}`)
        .send(payload)
        .expect(201)

      await request(app)
        .post(`/api/payments/disputes/admin/${first.body.disputeId}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'resolved', resolution: 'Refund issued' })
        .expect(200)

      const second = await request(app)
        .post('/api/payments/disputes')
        .set('Authorization', `Bearer ${tenantToken}`)
        .send(payload)

      expect(second.status).toBe(201)
    })

    // --- Documented gaps: current code does not enforce these policies ---

    it('FINDING: allows a user with no relationship to the payment to open a dispute against it (no party-only check)', async () => {
      const payload = validCreatePayload()
      const res = await request(app)
        .post('/api/payments/disputes')
        .set('Authorization', `Bearer ${otherUserToken}`)
        .send(payload)

      // Documents current behavior — the route has no ownership/party check on paymentId.
      expect(res.status).toBe(201)
      expect(disputes.get(res.body.disputeId)?.userId).toBe(otherUserId)
    })

    it('FINDING: allows opening a dispute against a paymentId with no corresponding payment at all', async () => {
      const payload = { ...validCreatePayload(), paymentId: randomUUID() }
      const res = await request(app)
        .post('/api/payments/disputes')
        .set('Authorization', `Bearer ${tenantToken}`)
        .send(payload)

      // Documents current behavior — nothing here validates the payment exists or is unsettled.
      expect(res.status).toBe(201)
    })
  })

  describe('GET /api/payments/disputes/my', () => {
    it('rejects unauthenticated requests', async () => {
      const res = await request(app).get('/api/payments/disputes/my')
      expect(res.status).toBe(401)
    })

    it("returns only the authenticated caller's own disputes, never another user's", async () => {
      await request(app)
        .post('/api/payments/disputes')
        .set('Authorization', `Bearer ${tenantToken}`)
        .send(validCreatePayload())
        .expect(201)
      await request(app)
        .post('/api/payments/disputes')
        .set('Authorization', `Bearer ${otherUserToken}`)
        .send(validCreatePayload())
        .expect(201)

      const res = await request(app)
        .get('/api/payments/disputes/my')
        .set('Authorization', `Bearer ${tenantToken}`)
        .expect(200)

      expect(res.body.disputes).toHaveLength(1)
      expect(res.body.disputes[0].userId).toBe(tenantId)
    })
  })

  describe('GET /api/payments/disputes/admin (list)', () => {
    it('rejects unauthenticated requests', async () => {
      const res = await request(app).get('/api/payments/disputes/admin')
      expect(res.status).toBe(401)
    })

    it('rejects an authenticated user without the disputes:view permission', async () => {
      const res = await request(app)
        .get('/api/payments/disputes/admin')
        .set('Authorization', `Bearer ${tenantToken}`)

      expect(res.status).toBe(403)
    })

    it('allows an admin-permitted caller and returns the paginated list', async () => {
      await request(app)
        .post('/api/payments/disputes')
        .set('Authorization', `Bearer ${tenantToken}`)
        .send(validCreatePayload())
        .expect(201)

      const res = await request(app)
        .get('/api/payments/disputes/admin')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)

      expect(res.body.total).toBe(1)
      expect(res.body.disputes).toHaveLength(1)
    })
  })

  describe('POST /api/payments/disputes/admin/:disputeId/resolve', () => {
    async function openDispute(token: string) {
      const res = await request(app)
        .post('/api/payments/disputes')
        .set('Authorization', `Bearer ${token}`)
        .send(validCreatePayload())
        .expect(201)
      return res.body.disputeId as string
    }

    it('rejects unauthenticated requests', async () => {
      const disputeId = await openDispute(tenantToken)
      const res = await request(app)
        .post(`/api/payments/disputes/admin/${disputeId}/resolve`)
        .send({ status: 'resolved' })
      expect(res.status).toBe(401)
    })

    it('rejects an authenticated caller without the disputes:resolve permission', async () => {
      const disputeId = await openDispute(tenantToken)
      const res = await request(app)
        .post(`/api/payments/disputes/admin/${disputeId}/resolve`)
        .set('Authorization', `Bearer ${tenantToken}`)
        .send({ status: 'resolved' })

      expect(res.status).toBe(403)
      expect(disputes.get(disputeId)?.status).toBe('pending')
    })

    it('returns 404 when resolving a dispute that does not exist', async () => {
      const res = await request(app)
        .post(`/api/payments/disputes/admin/${randomUUID()}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'resolved' })

      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe('NOT_FOUND')
    })

    it('rejects an invalid resolution status', async () => {
      const disputeId = await openDispute(tenantToken)
      const res = await request(app)
        .post(`/api/payments/disputes/admin/${disputeId}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'closed' })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
      expect(disputes.get(disputeId)?.status).toBe('pending')
    })

    it('resolves a pending dispute as upheld ("resolved"), recording the resolver and resolution text', async () => {
      const disputeId = await openDispute(tenantToken)

      const res = await request(app)
        .post(`/api/payments/disputes/admin/${disputeId}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'resolved', resolution: 'Duplicate charge confirmed, refund issued' })
        .expect(200)

      expect(res.body.success).toBe(true)
      const stored = disputes.get(disputeId)
      expect(stored?.status).toBe('resolved')
      expect(stored?.resolvedBy).toBe(adminId)
      expect(stored?.resolution).toBe('Duplicate charge confirmed, refund issued')
    })

    it('resolves a pending dispute as rejected', async () => {
      const disputeId = await openDispute(tenantToken)

      await request(app)
        .post(`/api/payments/disputes/admin/${disputeId}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'rejected', resolution: 'Charge verified as correct' })
        .expect(200)

      expect(disputes.get(disputeId)?.status).toBe('rejected')
    })

    it('is idempotent when the identical resolve call is repeated for the same dispute id', async () => {
      const disputeId = await openDispute(tenantToken)
      const body = { status: 'resolved', resolution: 'Refund issued' }

      await request(app)
        .post(`/api/payments/disputes/admin/${disputeId}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(body)
        .expect(200)

      const second = await request(app)
        .post(`/api/payments/disputes/admin/${disputeId}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(body)
        .expect(200)

      expect(second.body.success).toBe(true)
      expect(disputes.get(disputeId)?.status).toBe('resolved')
    })

    it('FINDING: does not reject re-resolving an already-resolved dispute with a different outcome (no illegal-transition guard)', async () => {
      const disputeId = await openDispute(tenantToken)

      await request(app)
        .post(`/api/payments/disputes/admin/${disputeId}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'resolved', resolution: 'Refund issued' })
        .expect(200)

      // Documents current behavior — a second, contradictory resolution on an
      // already-terminal dispute currently succeeds instead of being rejected
      // (e.g. with a 409 conflict).
      const flip = await request(app)
        .post(`/api/payments/disputes/admin/${disputeId}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'rejected', resolution: 'Reversed decision' })

      expect(flip.status).toBe(200)
      expect(disputes.get(disputeId)?.status).toBe('rejected')
    })
  })
})
