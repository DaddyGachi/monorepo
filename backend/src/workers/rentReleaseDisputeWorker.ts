import { SorobanAdapter } from '../soroban/adapter.js'
import { logger } from '../utils/logger.js'
import { outboxStore } from '../outbox/store.js'
import { OutboxStatus, TxType, type OutboxItem } from '../outbox/types.js'
import { isDealSyncEnabled } from '../services/deals/dealSyncConfig.js'
import { isDealEscrowContractError } from '../soroban/errors.js'
import { paymentDisputeRepository } from '../repositories/PaymentDisputeRepository.js'

const MAX_DISPUTE_SYNC_RETRIES = 5
const BASE_BACKOFF_MS = 1000

function getBackoffMs(retryCount: number): number {
  return Math.min(Math.pow(2, retryCount) * BASE_BACKOFF_MS, 60 * 60 * 1000)
}

function shouldRetry(item: OutboxItem): boolean {
  if (item.retryCount >= MAX_DISPUTE_SYNC_RETRIES) return false
  if (!item.nextRetryAt) return true
  return Date.now() >= new Date(item.nextRetryAt).getTime()
}

/**
 * Errors that mean "this call can never succeed as submitted" (the challenge
 * window closed, there's nothing to challenge/resolve, or it was already
 * settled) — these dead-letter immediately instead of retrying, and are
 * surfaced back onto the dispute row so the rejection is visible rather than
 * silently swallowed.
 */
function isTerminalDisputeError(error: unknown): boolean {
  return (
    isDealEscrowContractError(error, 'DisputeNotAllowed') ||
    isDealEscrowContractError(error, 'NoPendingRelease') ||
    isDealEscrowContractError(error, 'NoOpenDispute') ||
    isDealEscrowContractError(error, 'InvalidSettlement')
  )
}

/**
 * Polls the outbox for rent-release dispute challenge/resolve events and
 * invokes the matching deal_escrow call. Also periodically sweeps open
 * disputes for expired challenge/dispute windows and settles them via
 * settle_dispute_timeout.
 *
 * Mirrors DealStatusSyncWorker's retry/backoff/dead-letter shape.
 */
export class RentReleaseDisputeWorker {
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
    logger.info('RentReleaseDisputeWorker started', { intervalMs, enabled: isDealSyncEnabled() })
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
    logger.info('RentReleaseDisputeWorker stopped')
  }

  async process() {
    if (!isDealSyncEnabled()) {
      return
    }

    const pending = await outboxStore.listByStatus(OutboxStatus.PENDING)
    const failed = await outboxStore.listByStatus(OutboxStatus.FAILED)
    const items = [...pending, ...failed].filter(
      (item) =>
        item.txType === TxType.RENT_RELEASE_DISPUTE_CHALLENGE ||
        item.txType === TxType.RENT_RELEASE_DISPUTE_RESOLVE,
    )

    for (const item of items) {
      if (item.status === OutboxStatus.FAILED && !shouldRetry(item)) {
        if (item.retryCount >= MAX_DISPUTE_SYNC_RETRIES) {
          await outboxStore.markDead(item.id, 'Max rent release dispute sync retry count reached')
          logger.error('Rent release dispute sync dead-lettered', {
            outboxId: item.id,
            disputeId: item.payload.disputeId,
            txType: item.txType,
            retryCount: item.retryCount,
            lastError: item.lastError,
          })
        }
        continue
      }

      await this.sendDisputeEvent(item)
    }

    await this.sweepTimeouts()
  }

  private async sendDisputeEvent(item: OutboxItem): Promise<void> {
    try {
      if (item.txType === TxType.RENT_RELEASE_DISPUTE_CHALLENGE) {
        await this.sendChallenge(item)
      } else {
        await this.sendResolve(item)
      }

      await outboxStore.updateStatus(item.id, OutboxStatus.SENT)
      logger.info('Rent release dispute sync succeeded', {
        outboxId: item.id,
        disputeId: item.payload.disputeId,
        txType: item.txType,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      if (isTerminalDisputeError(error)) {
        await outboxStore.markDead(item.id, errorMessage)
        await this.surfaceTerminalFailure(item, errorMessage)
        logger.warn('Rent release dispute call rejected on-chain (terminal, not retrying)', {
          outboxId: item.id,
          disputeId: item.payload.disputeId,
          txType: item.txType,
          error: errorMessage,
        })
        return
      }

      const currentRetryCount = item.retryCount || 0
      const nextRetryAt = new Date(Date.now() + getBackoffMs(currentRetryCount))

      if (currentRetryCount + 1 >= MAX_DISPUTE_SYNC_RETRIES) {
        await outboxStore.markDead(item.id, errorMessage)
        logger.error('Rent release dispute sync failed — dead-lettered', {
          outboxId: item.id,
          disputeId: item.payload.disputeId,
          retryCount: currentRetryCount + 1,
          lastError: errorMessage,
        })
        return
      }

      await outboxStore.updateStatus(item.id, OutboxStatus.FAILED, {
        error: errorMessage,
        nextRetryAt,
      })
      logger.warn('Rent release dispute sync failed — will retry', {
        outboxId: item.id,
        disputeId: item.payload.disputeId,
        retryCount: currentRetryCount + 1,
        lastError: errorMessage,
      })
    }
  }

  /**
   * A challenge rejected on-chain with DisputeNotAllowed/NoPendingRelease
   * means the dispute never actually protected the tenant — surface that on
   * the dispute row (instead of silently leaving it "pending" forever with
   * no on-chain effect) so it's visible to the admin resolving it.
   */
  private async surfaceTerminalFailure(item: OutboxItem, errorMessage: string): Promise<void> {
    if (item.txType !== TxType.RENT_RELEASE_DISPUTE_CHALLENGE) return
    const disputeId = String(item.payload.disputeId ?? '')
    if (!disputeId) return
    try {
      const dispute = await paymentDisputeRepository.findById(disputeId)
      if (!dispute || dispute.status !== 'pending') return
      await paymentDisputeRepository.updateStatus(
        disputeId,
        'rejected',
        `Could not be filed on-chain: ${errorMessage}`,
      )
    } catch (err) {
      logger.error('Failed to surface terminal dispute-challenge failure on dispute row', {
        disputeId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  private async sendChallenge(item: OutboxItem): Promise<void> {
    if (!this.adapter.challengeRentRelease) return

    const payload = item.payload
    const dealId = String(payload.dealId ?? '')
    const challengeEvidenceRef = String(payload.challengeEvidenceRef ?? '')
    if (!dealId || !challengeEvidenceRef) {
      throw new Error('Invalid RENT_RELEASE_DISPUTE_CHALLENGE payload')
    }

    await this.adapter.challengeRentRelease({ dealId, challengeEvidenceRef })
  }

  private async sendResolve(item: OutboxItem): Promise<void> {
    if (!this.adapter.resolveRentDispute) return

    const payload = item.payload
    const dealId = String(payload.dealId ?? '')
    const outcome = payload.outcome as 'release_to_recipient' | 'refund_to_depositor'
    const resolutionEvidenceRef = String(payload.resolutionEvidenceRef ?? '')
    if (!dealId || !outcome) {
      throw new Error('Invalid RENT_RELEASE_DISPUTE_RESOLVE payload')
    }

    await this.adapter.resolveRentDispute({ dealId, outcome, resolutionEvidenceRef })
  }

  /**
   * Sweeps open (pending/under_review) disputes with a dealId and attempts
   * settle_dispute_timeout for each. The contract itself gates on whether the
   * dispute timeout has actually elapsed (InvalidReleaseWindow if not) — that
   * "not yet" result is expected for the vast majority of polled disputes and
   * is logged at debug level, not treated as a failure.
   *
   * Note: settle_rent_release_timeout (uncontested, never-challenged expired
   * releases) has no trigger source here — there is no Postgres registry of
   * "deals with a pending on-chain release" since request_rent_release isn't
   * wired up anywhere in the backend yet (see PR description). The adapter
   * method exists and is ready to call once such a registry exists.
   */
  private async sweepTimeouts(): Promise<void> {
    if (!this.adapter.settleDisputeTimeout) return

    for (const status of ['pending', 'under_review'] as const) {
      let disputes
      try {
        disputes = (await paymentDisputeRepository.list({ status, pageSize: 200 })).disputes
      } catch (err) {
        logger.error('Failed to list open disputes for timeout sweep', {
          status,
          error: err instanceof Error ? err.message : String(err),
        })
        continue
      }

      for (const dispute of disputes) {
        if (!dispute.dealId) continue
        try {
          await this.adapter.settleDisputeTimeout({ dealId: dispute.dealId })
          logger.info('Dispute timeout settled on-chain', {
            disputeId: dispute.id,
            dealId: dispute.dealId,
          })
        } catch (error) {
          if (
            isDealEscrowContractError(error, 'InvalidReleaseWindow') ||
            isDealEscrowContractError(error, 'NoOpenDispute')
          ) {
            // Not yet expired, or nothing on-chain to settle — expected for
            // most polled disputes.
            continue
          }
          logger.warn('Dispute timeout settlement attempt failed', {
            disputeId: dispute.id,
            dealId: dispute.dealId,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
    }
  }
}
