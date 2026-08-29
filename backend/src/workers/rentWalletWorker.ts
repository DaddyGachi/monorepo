import { SorobanAdapter } from '../soroban/adapter.js'
import { logger } from '../utils/logger.js'
import { outboxStore } from '../outbox/store.js'
import { OutboxStatus, TxType, type OutboxItem } from '../outbox/types.js'

const MAX_RENT_WALLET_RETRIES = 5
const BASE_BACKOFF_MS = 1000

function getBackoffMs(retryCount: number): number {
  return Math.min(Math.pow(2, retryCount) * BASE_BACKOFF_MS, 60 * 60 * 1000)
}

function shouldRetry(item: OutboxItem): boolean {
  if (item.retryCount >= MAX_RENT_WALLET_RETRIES) return false
  if (!item.nextRetryAt) return true
  return Date.now() >= new Date(item.nextRetryAt).getTime()
}

/**
 * Polls the outbox for rent_wallet credit/debit events and
 * invokes the matching rent_wallet contract call.
 *
 * This provides on-chain mirroring of tenant rent balances for
 * tamper-evident record-keeping.
 */
export class RentWalletWorker {
  private intervalId: NodeJS.Timeout | null = null
  private running = false
  private processingPromise: Promise<void> | null = null

  constructor(private adapter: SorobanAdapter) {}

  start(intervalMs = 30000) {
    if (this.running) return
    this.running = true
    this.intervalId = setInterval(() => {
      this.processingPromise = this.process().finally(() => {
        this.processingPromise = null
      })
    }, intervalMs)
    logger.info('RentWalletWorker started', { intervalMs })
  }

  async stop() {
    this.running = false
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    if (this.processingPromise) {
      await this.processingPromise
    }
    logger.info('RentWalletWorker stopped')
  }

  async process() {
    const pending = await outboxStore.listByStatus(OutboxStatus.PENDING)
    const failed = await outboxStore.listByStatus(OutboxStatus.FAILED)
    const items = [...pending, ...failed].filter(
      (item) =>
        item.txType === TxType.RENT_WALLET_CREDIT ||
        item.txType === TxType.RENT_WALLET_DEBIT,
    )

    for (const item of items) {
      if (item.status === OutboxStatus.FAILED && !shouldRetry(item)) {
        if (item.retryCount >= MAX_RENT_WALLET_RETRIES) {
          await outboxStore.markDead(item.id, 'Max rent wallet sync retry count reached')
          logger.error('Rent wallet sync dead-lettered', {
            outboxId: item.id,
            account: item.payload.account,
            txType: item.txType,
            retryCount: item.retryCount,
            lastError: item.lastError,
          })
        }
        continue
      }

      try {
        await this.processItem(item)
      } catch (error) {
        logger.error('Failed to process rent wallet item', {
          outboxId: item.id,
          account: item.payload.account,
          txType: item.txType,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  private async processItem(item: OutboxItem) {
    const { account, amount } = item.payload as { account: string; amount: string }

    if (!account || !amount) {
      await outboxStore.markDead(item.id, 'Missing account or amount in payload')
      logger.error('Rent wallet item missing required payload fields', {
        outboxId: item.id,
        payload: item.payload,
      })
      return
    }

    const amountBigInt = BigInt(amount)

    try {
      let txHash: string

      if (item.txType === TxType.RENT_WALLET_CREDIT) {
        if (!this.adapter.rentWalletCredit) {
          throw new Error('rentWalletCredit not available on adapter')
        }
        txHash = await this.adapter.rentWalletCredit(account, amountBigInt)
      } else if (item.txType === TxType.RENT_WALLET_DEBIT) {
        if (!this.adapter.rentWalletDebit) {
          throw new Error('rentWalletDebit not available on adapter')
        }
        txHash = await this.adapter.rentWalletDebit(account, amountBigInt)
      } else {
        throw new Error(`Unsupported txType: ${item.txType}`)
      }

      await outboxStore.updateStatus(item.id, OutboxStatus.SENT)
      logger.info('Rent wallet sync succeeded', {
        outboxId: item.id,
        account,
        txType: item.txType,
        amount,
        txHash,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const currentRetryCount = item.retryCount || 0
      const nextRetryAt = new Date(Date.now() + getBackoffMs(currentRetryCount))

      if (currentRetryCount + 1 >= MAX_RENT_WALLET_RETRIES) {
        await outboxStore.markDead(item.id, errorMessage)
        logger.error('Rent wallet sync failed — dead-lettered', {
          outboxId: item.id,
          account,
          txType: item.txType,
          retryCount: currentRetryCount + 1,
          lastError: errorMessage,
        })
      } else {
        await outboxStore.updateStatus(item.id, OutboxStatus.FAILED, { error: errorMessage, nextRetryAt })
        logger.warn('Rent wallet sync failed, will retry', {
          outboxId: item.id,
          account,
          txType: item.txType,
          retryCount: currentRetryCount,
          nextRetryAt: nextRetryAt.toISOString(),
          error: errorMessage,
        })
      }
    }
  }
}
