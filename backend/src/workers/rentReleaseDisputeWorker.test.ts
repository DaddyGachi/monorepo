import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { v4 as randomUUID } from 'uuid'
import { RentReleaseDisputeWorker } from './rentReleaseDisputeWorker.js'
import { outboxStore } from '../outbox/store.js'
import { OutboxStatus, TxType } from '../outbox/types.js'

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
      return dispute
    }),
    list: vi.fn(async (filter?: { status?: DisputeStatus }) => {
      const items = [...disputes.values()].filter((d) => !filter?.status || d.status === filter.status)
      return { disputes: items, total: items.length, page: 1, pageSize: 200, totalPages: 1 }
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
    description: 'desc',
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

describe('RentReleaseDisputeWorker', () => {
  beforeEach(async () => {
    await outboxStore.clear()
    disputes.clear()
    vi.clearAllMocks()
    process.env.DEAL_SYNC_ENABLED = 'true'
  })

  afterEach(async () => {
    delete process.env.DEAL_SYNC_ENABLED
    await outboxStore.clear()
  })

  it('does nothing when deal sync is disabled', async () => {
    process.env.DEAL_SYNC_ENABLED = 'false'
    await outboxStore.create({
      txType: TxType.RENT_RELEASE_DISPUTE_CHALLENGE,
      source: 'rent_release_dispute',
      ref: 'd1:challenge',
      payload: { disputeId: 'd1', dealId: 'deal-1', challengeEvidenceRef: 'evidence' },
    })

    const adapter = { challengeRentRelease: vi.fn() } as any
    const worker = new RentReleaseDisputeWorker(adapter)
    await worker.process()

    expect(adapter.challengeRentRelease).not.toHaveBeenCalled()
  })

  it('sends a challenge and marks the outbox item SENT on success', async () => {
    const item = await outboxStore.create({
      txType: TxType.RENT_RELEASE_DISPUTE_CHALLENGE,
      source: 'rent_release_dispute',
      ref: 'd1:challenge',
      payload: { disputeId: 'd1', dealId: 'deal-1', challengeEvidenceRef: 'evidence' },
    })

    const adapter = { challengeRentRelease: vi.fn().mockResolvedValue(undefined) } as any
    const worker = new RentReleaseDisputeWorker(adapter)
    await worker.process()

    expect(adapter.challengeRentRelease).toHaveBeenCalledWith({
      dealId: 'deal-1',
      challengeEvidenceRef: 'evidence',
    })
    const updated = await outboxStore.getById(item.id)
    expect(updated?.status).toBe(OutboxStatus.SENT)
  })

  it('sends a resolve call with the outcome from the payload', async () => {
    const item = await outboxStore.create({
      txType: TxType.RENT_RELEASE_DISPUTE_RESOLVE,
      source: 'rent_release_dispute',
      ref: 'd1:resolve:resolved',
      payload: {
        disputeId: 'd1',
        dealId: 'deal-1',
        outcome: 'refund_to_depositor',
        resolutionEvidenceRef: 'Refund issued',
      },
    })

    const adapter = { resolveRentDispute: vi.fn().mockResolvedValue(undefined) } as any
    const worker = new RentReleaseDisputeWorker(adapter)
    await worker.process()

    expect(adapter.resolveRentDispute).toHaveBeenCalledWith({
      dealId: 'deal-1',
      outcome: 'refund_to_depositor',
      resolutionEvidenceRef: 'Refund issued',
    })
    const updated = await outboxStore.getById(item.id)
    expect(updated?.status).toBe(OutboxStatus.SENT)
  })

  it('dead-letters immediately (no retry) on a terminal DisputeNotAllowed error, and marks the dispute rejected', async () => {
    const dispute = seedDispute({ status: 'pending' })
    const item = await outboxStore.create({
      txType: TxType.RENT_RELEASE_DISPUTE_CHALLENGE,
      source: 'rent_release_dispute',
      ref: `${dispute.id}:challenge`,
      payload: { disputeId: dispute.id, dealId: dispute.dealId, challengeEvidenceRef: 'evidence' },
    })

    const adapter = {
      challengeRentRelease: vi.fn().mockRejectedValue(new Error('Error(Contract, #18)')),
    } as any
    const worker = new RentReleaseDisputeWorker(adapter)
    await worker.process()

    const updated = await outboxStore.getById(item.id)
    expect(updated?.status).toBe(OutboxStatus.DEAD)

    expect(disputes.get(dispute.id)?.status).toBe('rejected')
    expect(disputes.get(dispute.id)?.resolution).toMatch(/Could not be filed on-chain/)
  })

  it('retries with backoff on a transient error and dead-letters after max retries', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    const item = await outboxStore.create({
      txType: TxType.RENT_RELEASE_DISPUTE_CHALLENGE,
      source: 'rent_release_dispute',
      ref: 'd2:challenge',
      payload: { disputeId: 'd2', dealId: 'deal-2', challengeEvidenceRef: 'evidence' },
    })

    const adapter = {
      challengeRentRelease: vi.fn().mockRejectedValue(new Error('rpc down')),
    } as any
    const worker = new RentReleaseDisputeWorker(adapter)

    await worker.process()
    let updated = await outboxStore.getById(item.id)
    expect(updated?.status).toBe(OutboxStatus.FAILED)

    for (let i = 0; i < 5; i++) {
      vi.setSystemTime(new Date(Date.now() + 60 * 60 * 1000))
      await worker.process()
    }

    updated = await outboxStore.getById(item.id)
    expect(updated?.status).toBe(OutboxStatus.DEAD)

    vi.useRealTimers()
  })

  it('sweeps open disputes and settles expired ones via settleDisputeTimeout', async () => {
    seedDispute({ id: 'open-1', status: 'pending', dealId: 'deal-a' })
    seedDispute({ id: 'open-2', status: 'under_review', dealId: 'deal-b' })
    seedDispute({ id: 'closed-1', status: 'resolved', dealId: 'deal-c' })

    const adapter = { settleDisputeTimeout: vi.fn().mockResolvedValue(undefined) } as any
    const worker = new RentReleaseDisputeWorker(adapter)
    await worker.process()

    const calledDealIds = adapter.settleDisputeTimeout.mock.calls.map((c: any[]) => c[0].dealId)
    expect(calledDealIds.sort()).toEqual(['deal-a', 'deal-b'])
  })

  it('tolerates InvalidReleaseWindow from the timeout sweep as a normal "not yet" outcome', async () => {
    seedDispute({ id: 'open-1', status: 'pending', dealId: 'deal-a' })

    const adapter = {
      settleDisputeTimeout: vi.fn().mockRejectedValue(new Error('Error(Contract, #14)')),
    } as any
    const worker = new RentReleaseDisputeWorker(adapter)
    await expect(worker.process()).resolves.not.toThrow()
  })
})
