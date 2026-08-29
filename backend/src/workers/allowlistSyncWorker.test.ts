import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AllowlistSyncWorker } from './allowlistSyncWorker.js'
import { outboxStore } from '../outbox/store.js'
import { OutboxStatus, TxType } from '../outbox/types.js'

describe('AllowlistSyncWorker', () => {
  beforeEach(async () => {
    await outboxStore.clear()
  })

  afterEach(async () => {
    await outboxStore.clear()
  })

  it('calls addToAllowlist for ALLOWLIST_ADD txType', async () => {
    await outboxStore.create({
      txType: TxType.ALLOWLIST_ADD,
      source: 'kyc_approval',
      ref: 'kyc-123',
      aggregateType: 'user',
      aggregateId: 'user-1',
      payload: {
        address: 'GABC123456789',
        label: 'approved',
      },
    })

    const adapter = {
      addToAllowlist: vi.fn().mockResolvedValue('allowlist_add_GABC123456789'),
      removeFromAllowlist: vi.fn().mockResolvedValue('allowlist_remove_GABC123456789'),
      isAllowlisted: vi.fn().mockResolvedValue(true),
      getAllowlistEntry: vi.fn().mockResolvedValue(null),
    } as any
    const worker = new AllowlistSyncWorker(adapter)
    await worker.process()

    expect(adapter.addToAllowlist).toHaveBeenCalledWith('GABC123456789', 'approved', undefined)
    expect(adapter.removeFromAllowlist).not.toHaveBeenCalled()

    const items = await outboxStore.listByStatus(OutboxStatus.SENT)
    expect(items).toHaveLength(1)
  })

  it('calls removeFromAllowlist for ALLOWLIST_REMOVE txType', async () => {
    await outboxStore.create({
      txType: TxType.ALLOWLIST_REMOVE,
      source: 'kyc_rejection',
      ref: 'kyc-456',
      aggregateType: 'user',
      aggregateId: 'user-2',
      payload: {
        address: 'GDEF987654321',
      },
    })

    const adapter = {
      addToAllowlist: vi.fn().mockResolvedValue('allowlist_add_GDEF987654321'),
      removeFromAllowlist: vi.fn().mockResolvedValue('allowlist_remove_GDEF987654321'),
      isAllowlisted: vi.fn().mockResolvedValue(false),
      getAllowlistEntry: vi.fn().mockResolvedValue(null),
    } as any
    const worker = new AllowlistSyncWorker(adapter)
    await worker.process()

    expect(adapter.removeFromAllowlist).toHaveBeenCalledWith('GDEF987654321')
    expect(adapter.addToAllowlist).not.toHaveBeenCalled()

    const items = await outboxStore.listByStatus(OutboxStatus.SENT)
    expect(items).toHaveLength(1)
  })

  it('handles expires_at in payload for ALLOWLIST_ADD', async () => {
    await outboxStore.create({
      txType: TxType.ALLOWLIST_ADD,
      source: 'kyc_approval',
      ref: 'kyc-789',
      aggregateType: 'user',
      aggregateId: 'user-3',
      payload: {
        address: 'GXYZ111222333',
        label: 'approved',
        expiresAt: 1234567890,
      },
    })

    const adapter = {
      addToAllowlist: vi.fn().mockResolvedValue('allowlist_add_GXYZ111222333'),
      removeFromAllowlist: vi.fn().mockResolvedValue('allowlist_remove_GXYZ111222333'),
      isAllowlisted: vi.fn().mockResolvedValue(true),
      getAllowlistEntry: vi.fn().mockResolvedValue(null),
    } as any
    const worker = new AllowlistSyncWorker(adapter)
    await worker.process()

    expect(adapter.addToAllowlist).toHaveBeenCalledWith('GXYZ111222333', 'approved', 1234567890)
  })

  it('marks item as FAILED on adapter error and retries', async () => {
    await outboxStore.create({
      txType: TxType.ALLOWLIST_ADD,
      source: 'kyc_approval',
      ref: 'kyc-error',
      aggregateType: 'user',
      aggregateId: 'user-error',
      payload: {
        address: 'GERROR555666',
        label: 'approved',
      },
    })

    const adapter = {
      addToAllowlist: vi.fn().mockRejectedValue(new Error('Network error')),
      removeFromAllowlist: vi.fn().mockResolvedValue('allowlist_remove_GERROR555666'),
      isAllowlisted: vi.fn().mockResolvedValue(true),
      getAllowlistEntry: vi.fn().mockResolvedValue(null),
    } as any
    const worker = new AllowlistSyncWorker(adapter)
    await worker.process()

    const failed = await outboxStore.listByStatus(OutboxStatus.FAILED)
    expect(failed).toHaveLength(1)
    expect(failed[0].lastError).toBe('Network error')
  })

  it('marks item as DEAD after max retries', async () => {
    const item = await outboxStore.create({
      txType: TxType.ALLOWLIST_ADD,
      source: 'kyc_approval',
      ref: 'kyc-dead',
      aggregateType: 'user',
      aggregateId: 'user-dead',
      payload: {
        address: 'GDEAD777888',
        label: 'approved',
      },
    })

    // Manually set retryCount to max
    await outboxStore.updateStatus(item.id, OutboxStatus.FAILED, {
      error: 'Previous error',
      nextRetryAt: new Date(Date.now() - 1000),
    })
    // Increment retry count to max
    for (let i = 0; i < 5; i++) {
      await outboxStore.updateStatus(item.id, OutboxStatus.FAILED, {
        error: 'Retry error',
        nextRetryAt: new Date(Date.now() - 1000),
      })
    }

    const adapter = {
      addToAllowlist: vi.fn().mockRejectedValue(new Error('Persistent error')),
      removeFromAllowlist: vi.fn().mockResolvedValue('allowlist_remove_GDEAD777888'),
      isAllowlisted: vi.fn().mockResolvedValue(true),
      getAllowlistEntry: vi.fn().mockResolvedValue(null),
    } as any
    const worker = new AllowlistSyncWorker(adapter)
    await worker.process()

    const dead = await outboxStore.listByStatus(OutboxStatus.DEAD)
    expect(dead).toHaveLength(1)
    expect(dead[0].lastError).toContain('Max allowlist sync retry count reached')
  })

  it('skips processing when adapter methods are not available', async () => {
    await outboxStore.create({
      txType: TxType.ALLOWLIST_ADD,
      source: 'kyc_approval',
      ref: 'kyc-skip',
      aggregateType: 'user',
      aggregateId: 'user-skip',
      payload: {
        address: 'GSKIP999000',
        label: 'approved',
      },
    })

    const adapter = {} as any
    const worker = new AllowlistSyncWorker(adapter)
    await worker.process()

    // Item should remain PENDING since worker has no methods
    const pending = await outboxStore.listByStatus(OutboxStatus.PENDING)
    expect(pending).toHaveLength(1)
  })

  it('processes both ALLOWLIST_ADD and ALLOWLIST_REMOVE items in one cycle', async () => {
    await outboxStore.create({
      txType: TxType.ALLOWLIST_ADD,
      source: 'kyc_approval',
      ref: 'kyc-add',
      aggregateType: 'user',
      aggregateId: 'user-add',
      payload: {
        address: 'GADD111222',
        label: 'approved',
      },
    })

    await outboxStore.create({
      txType: TxType.ALLOWLIST_REMOVE,
      source: 'kyc_rejection',
      ref: 'kyc-remove',
      aggregateType: 'user',
      aggregateId: 'user-remove',
      payload: {
        address: 'GREMOVE333444',
      },
    })

    const adapter = {
      addToAllowlist: vi.fn().mockResolvedValue('allowlist_add_GADD111222'),
      removeFromAllowlist: vi.fn().mockResolvedValue('allowlist_remove_GREMOVE333444'),
      isAllowlisted: vi.fn().mockResolvedValue(true),
      getAllowlistEntry: vi.fn().mockResolvedValue(null),
    } as any
    const worker = new AllowlistSyncWorker(adapter)
    await worker.process()

    expect(adapter.addToAllowlist).toHaveBeenCalledTimes(1)
    expect(adapter.removeFromAllowlist).toHaveBeenCalledTimes(1)

    const sent = await outboxStore.listByStatus(OutboxStatus.SENT)
    expect(sent).toHaveLength(2)
  })
})
