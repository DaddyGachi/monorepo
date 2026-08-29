import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import { v4 as randomUUID } from 'uuid'
import { createTenantPaymentsRouter } from './tenantPayments.js'
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
    findByUserId: vi.fn(async (userId: string) => [...disputes.values()].filter((d) => d.userId === userId)),
  },
}))

function buildApp(): express.Express {
  const app = express()
  app.use(requestIdMiddleware)
  app.use(express.json())
  app.use('/api/tenant/payments', createTenantPaymentsRouter())
  app.use(errorHandler)
  return app
}

describe('POST /api/tenant/payments/disputes — on-chain challenge wiring', () => {
  let app: express.Express
  let tenantToken: string

  beforeEach(async () => {
    vi.clearAllMocks()
    disputes.clear()
    await outboxStore.clear()
    sessionStore.clear()
    userStore.clear()
    app = buildApp()

    const tenant = await userStore.getOrCreateByEmail('tenant-disputes@example.com')
    tenantToken = 'test-token-tenant-disputes'
    await sessionStore.create(tenant.email, tenantToken)
  })

  afterEach(async () => {
    await outboxStore.clear()
  })

  it('rejects a dispute filed without a dealId', async () => {
    const res = await request(app)
      .post('/api/tenant/payments/disputes')
      .set('Authorization', `Bearer ${tenantToken}`)
      .send({
        paymentId: randomUUID(),
        reason: 'amount_discrepancy',
        description: 'The charged amount does not match the agreed rent.',
      })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('creates a dispute and enqueues an on-chain challenge_rent_release call', async () => {
    const res = await request(app)
      .post('/api/tenant/payments/disputes')
      .set('Authorization', `Bearer ${tenantToken}`)
      .send({
        paymentId: randomUUID(),
        dealId: 'deal-1',
        reason: 'amount_discrepancy',
        description: 'The charged amount does not match the agreed rent.',
      })
      .expect(201)

    expect(res.body.success).toBe(true)
    const disputeId = res.body.data.dispute.id

    await new Promise((r) => setTimeout(r, 0))
    const items = await outboxStore.listByStatus('pending' as any)
    const item = items.find((i) => i.txType === TxType.RENT_RELEASE_DISPUTE_CHALLENGE)
    expect(item?.payload).toMatchObject({
      disputeId,
      dealId: 'deal-1',
    })
  })
})
