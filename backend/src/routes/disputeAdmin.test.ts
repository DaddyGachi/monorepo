import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import { v4 as randomUUID } from 'uuid'
import { createDisputeAdminRouter } from './disputeAdmin.js'
import { errorHandler } from '../middleware/errorHandler.js'
import { requestIdMiddleware } from '../middleware/requestId.js'
import { sessionStore, userStore } from '../models/authStore.js'
import { outboxStore } from '../outbox/store.js'
import { TxType } from '../outbox/types.js'

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
    findById: vi.fn(async (id: string) => disputes.get(id) ?? null),
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

function seedDispute(overrides: Partial<FakeDispute> = {}): FakeDispute {
  const dispute: FakeDispute = {
    id: randomUUID(),
    userId: 'tenant-1',
    paymentId: randomUUID(),
    dealId: 'deal-1',
    reason: 'amount_discrepancy',
    description: 'The charged amount does not match the agreed rent.',
    evidenceKeys: [],
    status: 'pending',
    resolution: null,
    resolvedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
  disputes.set(dispute.id, dispute)
  return dispute
}

function buildApp(): express.Express {
  const app = express()
  app.use(requestIdMiddleware)
  app.use(express.json())
  app.use('/api/admin/disputes', createDisputeAdminRouter())
  app.use(errorHandler)
  return app
}

describe('Dispute Admin Routes', () => {
  let app: express.Express
  let tenantToken: string
  let adminToken: string
  let adminId: string

  beforeEach(async () => {
    vi.clearAllMocks()
    disputes.clear()
    await outboxStore.clear()
    sessionStore.clear()
    userStore.clear()
    app = buildApp()

    const tenant = await userStore.getOrCreateByEmail('dispute-admin-tenant@example.com')
    tenantToken = 'test-token-dispute-admin-tenant'
    await sessionStore.create(tenant.email, tenantToken)

    const admin = await userStore.getOrCreateByEmail('dispute-admin-admin@example.com')
    adminId = admin.id
    admin.role = 'admin'
    adminToken = 'test-token-dispute-admin-admin'
    await sessionStore.create(admin.email, adminToken)
  })

  afterEach(async () => {
    await outboxStore.clear()
  })

  describe('GET /api/admin/disputes', () => {
    it('rejects unauthenticated requests', async () => {
      const res = await request(app).get('/api/admin/disputes')
      expect(res.status).toBe(401)
    })

    it('rejects a caller without the disputes:view permission', async () => {
      const res = await request(app).get('/api/admin/disputes').set('Authorization', `Bearer ${tenantToken}`)
      expect(res.status).toBe(403)
    })

    it('lists disputes for an admin-permitted caller', async () => {
      seedDispute()
      const res = await request(app)
        .get('/api/admin/disputes')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)

      expect(res.body.total).toBe(1)
    })
  })

  describe('POST /api/admin/disputes/:disputeId/resolve', () => {
    it('rejects unauthenticated requests', async () => {
      const dispute = seedDispute()
      const res = await request(app)
        .post(`/api/admin/disputes/${dispute.id}/resolve`)
        .send({ status: 'resolved' })
      expect(res.status).toBe(401)
    })

    it('rejects a caller without the disputes:resolve permission', async () => {
      const dispute = seedDispute()
      const res = await request(app)
        .post(`/api/admin/disputes/${dispute.id}/resolve`)
        .set('Authorization', `Bearer ${tenantToken}`)
        .send({ status: 'resolved' })
      expect(res.status).toBe(403)
    })

    it('returns 404 for a dispute that does not exist', async () => {
      const res = await request(app)
        .post(`/api/admin/disputes/${randomUUID()}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'resolved' })
      expect(res.status).toBe(404)
    })

    it('rejects an invalid status', async () => {
      const dispute = seedDispute()
      const res = await request(app)
        .post(`/api/admin/disputes/${dispute.id}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'closed' })
      expect(res.status).toBe(400)
    })

    it('resolving as "resolved" updates the dispute and enqueues resolve_rent_dispute with RefundToDepositor', async () => {
      const dispute = seedDispute()
      const res = await request(app)
        .post(`/api/admin/disputes/${dispute.id}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'resolved', resolution: 'Refund issued' })
        .expect(200)

      expect(res.body.success).toBe(true)
      expect(disputes.get(dispute.id)?.status).toBe('resolved')
      expect(disputes.get(dispute.id)?.resolvedBy).toBe(adminId)

      // Enqueue happens fire-and-forget; give the microtask queue a tick.
      await new Promise((r) => setTimeout(r, 0))
      const items = await outboxStore.listByStatus('pending' as any)
      const item = items.find((i) => i.txType === TxType.RENT_RELEASE_DISPUTE_RESOLVE)
      expect(item?.payload).toMatchObject({
        disputeId: dispute.id,
        dealId: 'deal-1',
        outcome: 'refund_to_depositor',
      })
    })

    it('resolving as "rejected" enqueues resolve_rent_dispute with ReleaseToRecipient', async () => {
      const dispute = seedDispute()
      await request(app)
        .post(`/api/admin/disputes/${dispute.id}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'rejected', resolution: 'Charge verified as correct' })
        .expect(200)

      await new Promise((r) => setTimeout(r, 0))
      const items = await outboxStore.listByStatus('pending' as any)
      const item = items.find((i) => i.txType === TxType.RENT_RELEASE_DISPUTE_RESOLVE)
      expect(item?.payload).toMatchObject({
        disputeId: dispute.id,
        outcome: 'release_to_recipient',
      })
    })

    it('does not enqueue an on-chain call when the dispute has no dealId', async () => {
      const dispute = seedDispute({ dealId: null })
      await request(app)
        .post(`/api/admin/disputes/${dispute.id}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'resolved', resolution: 'Refund issued' })
        .expect(200)

      await new Promise((r) => setTimeout(r, 0))
      const items = await outboxStore.listByStatus('pending' as any)
      expect(items.find((i) => i.txType === TxType.RENT_RELEASE_DISPUTE_RESOLVE)).toBeUndefined()
    })
  })
})
