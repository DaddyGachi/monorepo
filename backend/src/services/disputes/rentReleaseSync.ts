/**
 * Wires payment disputes to deal_escrow's on-chain rent-release dispute
 * mechanism via the outbox/worker pattern (never a synchronous adapter call
 * from a request handler) — see RentReleaseDisputeWorker.
 */

import { outboxStore } from '../../outbox/store.js'
import { TxType } from '../../outbox/types.js'
import { logger } from '../../utils/logger.js'
import type { PaymentDispute } from '../../schemas/paymentDispute.js'
import type { RentDisputeOutcome } from '../../soroban/adapter.js'

export type DisputeResolutionStatus = 'resolved' | 'rejected'

/**
 * Maps a payment dispute's resolution status to deal_escrow's
 * SettlementOutcome.
 *
 * - "resolved" (the tenant's dispute is upheld) -> RefundToDepositor: the
 *   pending rent release is refunded to the tenant, not released to the
 *   landlord.
 * - "rejected" (the dispute is denied) -> ReleaseToRecipient: the originally
 *   requested release proceeds to its recipient (the landlord).
 */
export function disputeStatusToSettlementOutcome(
  status: DisputeResolutionStatus,
): RentDisputeOutcome {
  return status === 'resolved' ? 'refund_to_depositor' : 'release_to_recipient'
}

/**
 * Enqueues an on-chain `challenge_rent_release` call for a newly filed
 * dispute. If the dispute has no dealId (e.g. a pre-migration row), this is
 * a no-op — there is nothing on-chain to challenge.
 */
export async function enqueueChallengeRentRelease(dispute: PaymentDispute): Promise<void> {
  if (!dispute.dealId) {
    logger.warn('Dispute has no dealId; skipping on-chain challenge_rent_release', {
      disputeId: dispute.id,
    })
    return
  }

  await outboxStore.create({
    txType: TxType.RENT_RELEASE_DISPUTE_CHALLENGE,
    source: 'rent_release_dispute',
    ref: `${dispute.id}:challenge`,
    aggregateType: 'payment_dispute',
    aggregateId: dispute.id,
    payload: {
      disputeId: dispute.id,
      dealId: dispute.dealId,
      challengeEvidenceRef: dispute.description.slice(0, 200),
    },
  })
  logger.info('Enqueued on-chain challenge_rent_release for dispute', {
    disputeId: dispute.id,
    dealId: dispute.dealId,
  })
}

/**
 * Enqueues an on-chain `resolve_rent_dispute` call for an admin resolution.
 * If the dispute has no dealId, this is a no-op (nothing on-chain to
 * resolve).
 */
export async function enqueueResolveRentDispute(
  dispute: PaymentDispute,
  status: DisputeResolutionStatus,
  resolution: string,
): Promise<void> {
  if (!dispute.dealId) {
    logger.warn('Dispute has no dealId; skipping on-chain resolve_rent_dispute', {
      disputeId: dispute.id,
    })
    return
  }

  const outcome = disputeStatusToSettlementOutcome(status)
  await outboxStore.create({
    txType: TxType.RENT_RELEASE_DISPUTE_RESOLVE,
    source: 'rent_release_dispute',
    ref: `${dispute.id}:resolve:${status}`,
    aggregateType: 'payment_dispute',
    aggregateId: dispute.id,
    payload: {
      disputeId: dispute.id,
      dealId: dispute.dealId,
      outcome,
      resolutionEvidenceRef: (resolution || status).slice(0, 200),
    },
  })
  logger.info('Enqueued on-chain resolve_rent_dispute for dispute', {
    disputeId: dispute.id,
    dealId: dispute.dealId,
    outcome,
  })
}
