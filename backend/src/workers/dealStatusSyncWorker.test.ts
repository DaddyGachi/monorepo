import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DealStatusSyncWorker } from './dealStatusSyncWorker.js'
import { outboxStore } from '../outbox/store.js'
import { OutboxStatus, TxType } from '../outbox/types.js'
import { dealIdToRentToOwnBytes32 } from '../services/deals/rentToOwnConversion.js'

describe('DealStatusSyncWorker — rent_to_own reuse', () => {
  beforeEach(async () => {
    await outboxStore.clear()
    process.env.DEAL_SYNC_ENABLED = 'true'
  })

  afterEach(async () => {
    delete process.env.DEAL_SYNC_ENABLED
    await outboxStore.clear()
  })

  it('calls rent_to_own completeRentToOwnDeal on a completed transition, reusing the DEAL_STATUS_CHANGED item', async () => {
    await outboxStore.create({
      txType: TxType.DEAL_STATUS_CHANGED,
      source: 'deal_status',
      ref: 'deal-1:completed',
      aggregateType: 'deal',
      aggregateId: 'deal-1',
      payload: {
        dealId: 'deal-1',
        contractDealId: 'deal-1',
        newStatus: 'completed',
        actor: 'system',
      },
    })

    const adapter = {
      syncDealStatus: vi.fn().mockResolvedValue(undefined),
      completeRentToOwnDeal: vi.fn().mockResolvedValue(undefined),
      defaultRentToOwnDeal: vi.fn().mockResolvedValue(undefined),
    } as any
    const worker = new DealStatusSyncWorker(adapter)
    await worker.process()

    expect(adapter.syncDealStatus).toHaveBeenCalledTimes(1)
    expect(adapter.completeRentToOwnDeal).toHaveBeenCalledWith({
      dealId: 'deal-1',
      contractDealId: dealIdToRentToOwnBytes32('deal-1'),
    })
    expect(adapter.defaultRentToOwnDeal).not.toHaveBeenCalled()
  })

  it('calls rent_to_own defaultRentToOwnDeal on a defaulted transition with a sanitized reason', async () => {
    await outboxStore.create({
      txType: TxType.DEAL_STATUS_CHANGED,
      source: 'deal_status',
      ref: 'deal-2:defaulted',
      aggregateType: 'deal',
      aggregateId: 'deal-2',
      payload: {
        dealId: 'deal-2',
        contractDealId: 'deal-2',
        newStatus: 'defaulted',
        actor: 'system',
        reason: 'missed payment #3',
      },
    })

    const adapter = {
      syncDealStatus: vi.fn().mockResolvedValue(undefined),
      completeRentToOwnDeal: vi.fn().mockResolvedValue(undefined),
      defaultRentToOwnDeal: vi.fn().mockResolvedValue(undefined),
    } as any
    const worker = new DealStatusSyncWorker(adapter)
    await worker.process()

    expect(adapter.defaultRentToOwnDeal).toHaveBeenCalledWith({
      dealId: 'deal-2',
      contractDealId: dealIdToRentToOwnBytes32('deal-2'),
      reason: 'missed_payment__3',
    })
    expect(adapter.completeRentToOwnDeal).not.toHaveBeenCalled()
  })

  it('does not call rent_to_own for an active transition (register_deal already starts the deal Active)', async () => {
    await outboxStore.create({
      txType: TxType.DEAL_STATUS_CHANGED,
      source: 'deal_status',
      ref: 'deal-3:active',
      aggregateType: 'deal',
      aggregateId: 'deal-3',
      payload: {
        dealId: 'deal-3',
        contractDealId: 'deal-3',
        newStatus: 'active',
        actor: 'system',
      },
    })

    const adapter = {
      syncDealStatus: vi.fn().mockResolvedValue(undefined),
      completeRentToOwnDeal: vi.fn().mockResolvedValue(undefined),
      defaultRentToOwnDeal: vi.fn().mockResolvedValue(undefined),
    } as any
    const worker = new DealStatusSyncWorker(adapter)
    await worker.process()

    expect(adapter.completeRentToOwnDeal).not.toHaveBeenCalled()
    expect(adapter.defaultRentToOwnDeal).not.toHaveBeenCalled()
  })

  it('still succeeds when the adapter has no rent_to_own methods (optional interface)', async () => {
    await outboxStore.create({
      txType: TxType.DEAL_STATUS_CHANGED,
      source: 'deal_status',
      ref: 'deal-4:completed',
      aggregateType: 'deal',
      aggregateId: 'deal-4',
      payload: {
        dealId: 'deal-4',
        contractDealId: 'deal-4',
        newStatus: 'completed',
        actor: 'system',
      },
    })

    const adapter = { syncDealStatus: vi.fn().mockResolvedValue(undefined) } as any
    const worker = new DealStatusSyncWorker(adapter)
    await worker.process()

    const items = await outboxStore.listByStatus(OutboxStatus.SENT)
    expect(items).toHaveLength(1)
  })
})
