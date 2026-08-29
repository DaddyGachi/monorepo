import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { outboxStore } from '../../outbox/store.js'
import { TxType } from '../../outbox/types.js'
import {
  disputeStatusToSettlementOutcome,
  enqueueChallengeRentRelease,
  enqueueResolveRentDispute,
} from './rentReleaseSync.js'
import type { PaymentDispute } from '../../schemas/paymentDispute.js'

function makeDispute(overrides: Partial<PaymentDispute> = {}): PaymentDispute {
  return {
    id: 'dispute-1',
    userId: 'user-1',
    paymentId: 'payment-1',
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
}

describe('disputeStatusToSettlementOutcome', () => {
  it('maps resolved (upheld) to refund_to_depositor', () => {
    expect(disputeStatusToSettlementOutcome('resolved')).toBe('refund_to_depositor')
  })

  it('maps rejected (denied) to release_to_recipient', () => {
    expect(disputeStatusToSettlementOutcome('rejected')).toBe('release_to_recipient')
  })
})

describe('enqueueChallengeRentRelease', () => {
  beforeEach(async () => {
    await outboxStore.clear()
  })
  afterEach(async () => {
    await outboxStore.clear()
  })

  it('enqueues a RENT_RELEASE_DISPUTE_CHALLENGE outbox item with the dealId', async () => {
    await enqueueChallengeRentRelease(makeDispute())

    const items = await outboxStore.listByStatus('pending' as any)
    const item = items.find((i) => i.txType === TxType.RENT_RELEASE_DISPUTE_CHALLENGE)
    expect(item).toBeDefined()
    expect(item?.payload).toMatchObject({
      disputeId: 'dispute-1',
      dealId: 'deal-1',
    })
  })

  it('is a no-op when the dispute has no dealId', async () => {
    await enqueueChallengeRentRelease(makeDispute({ dealId: null }))

    const items = await outboxStore.listByStatus('pending' as any)
    expect(items.find((i) => i.txType === TxType.RENT_RELEASE_DISPUTE_CHALLENGE)).toBeUndefined()
  })
})

describe('enqueueResolveRentDispute', () => {
  beforeEach(async () => {
    await outboxStore.clear()
  })
  afterEach(async () => {
    await outboxStore.clear()
  })

  it('enqueues a RENT_RELEASE_DISPUTE_RESOLVE item with the mapped outcome', async () => {
    await enqueueResolveRentDispute(makeDispute(), 'resolved', 'Refund issued')

    const items = await outboxStore.listByStatus('pending' as any)
    const item = items.find((i) => i.txType === TxType.RENT_RELEASE_DISPUTE_RESOLVE)
    expect(item).toBeDefined()
    expect(item?.payload).toMatchObject({
      disputeId: 'dispute-1',
      dealId: 'deal-1',
      outcome: 'refund_to_depositor',
    })
  })

  it('is idempotent for a repeated resolve at the same status', async () => {
    const dispute = makeDispute()
    await enqueueResolveRentDispute(dispute, 'resolved', 'Refund issued')
    await enqueueResolveRentDispute(dispute, 'resolved', 'Refund issued (again)')

    const items = (await outboxStore.listByStatus('pending' as any)).filter(
      (i) => i.txType === TxType.RENT_RELEASE_DISPUTE_RESOLVE,
    )
    expect(items).toHaveLength(1)
  })

  it('is a no-op when the dispute has no dealId', async () => {
    await enqueueResolveRentDispute(makeDispute({ dealId: null }), 'resolved', 'text')

    const items = await outboxStore.listByStatus('pending' as any)
    expect(items.find((i) => i.txType === TxType.RENT_RELEASE_DISPUTE_RESOLVE)).toBeUndefined()
  })
})
