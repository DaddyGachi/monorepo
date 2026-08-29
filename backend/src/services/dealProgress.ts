/**
 * Deal Progress Service
 *
 * Computes a deal's payment progress by reading TENANT_REPAYMENT receipts
 * from the outbox store (the ledger proxy).
 *
 * USDC is canonical. Only SENT outbox items (i.e. confirmed on-chain) are counted.
 */

import { OutboxStatus, TxType, type OutboxItem } from '../outbox/types.js'
import type { DealWithSchedule } from '../models/deal.js'
import { parseCanonicalString } from '../outbox/canonicalization.js'
import { computeEquityCapUsdc } from './deals/rentToOwnConversion.js'

export interface DealProgress {
  /** Total USDC paid across all on-chain TENANT_REPAYMENT receipts */
  totalPaidUsdc: string
  /** Number of TENANT_REPAYMENT receipts confirmed on-chain */
  periodsPaid: number
  /** termMonths minus periodsPaid, clamped to >= 0 */
  remainingPeriods: number
  /** ISO date of next scheduled payment; null if fully paid */
  nextDueDate: string | null
  /** txId of the most recent confirmed receipt; undefined if no payments yet */
  lastPaymentTxId?: string
  /** Source part of canonicalExternalRefV1 (e.g. "stripe"); undefined if no payments yet */
  lastPaymentExternalRefSource?: string
  /** Ref part of canonicalExternalRefV1 (e.g. "pi_abc123"); undefined if no payments yet */
  lastPaymentExternalRef?: string
  /**
   * Rent-to-own equity confirmed on-chain (sum of SENT RENT_TO_OWN_EQUITY_PAYMENT
   * receipts' equityAmountUsdc — i.e. record_equity_payment calls that have
   * actually landed on rent_to_own, not merely queued). Decimal string, 6 dp.
   */
  equityAccumulatedUsdc: string
  /** rent_to_own's property_value_usdc equity cap for this deal, in USDC. */
  equityCapUsdc: string
  /** equityAccumulatedUsdc as basis points of equityCapUsdc (0-10000), mirroring the contract's get_equity_percentage. */
  equityPercentageBps: number
  /** Number of equity payments confirmed on-chain (SENT RENT_TO_OWN_EQUITY_PAYMENT receipts). */
  equityPaymentsConfirmed: number
}

/**
 * Compute deal progress from on-chain receipts.
 *
 * @param deal            - Deal with schedule (used for termMonths and due dates)
 * @param items           - All outbox items for this deal (any txType, any status)
 * @param equityItems     - RENT_TO_OWN_EQUITY_PAYMENT outbox items for this deal (any status)
 */
export function computeDealProgress(
  deal: DealWithSchedule,
  items: OutboxItem[],
  equityItems: OutboxItem[] = [],
): DealProgress {
  // Filter: only SENT TENANT_REPAYMENT receipts count as paid on-chain
  const paidReceipts = items.filter(
    (item) =>
      item.txType === TxType.TENANT_REPAYMENT &&
      item.status === OutboxStatus.SENT,
  )

  // Total USDC paid (sum amountUsdc from payload)
  const totalPaidUsdcNum = paidReceipts.reduce((acc, item) => {
    const amount = parseFloat(String(item.payload.amountUsdc ?? '0'))
    return acc + (isNaN(amount) ? 0 : amount)
  }, 0)

  const periodsPaid = paidReceipts.length
  const remainingPeriods = Math.max(0, deal.termMonths - periodsPaid)

  // Next due date: look at schedule index = periodsPaid (0-indexed)
  const nextScheduleItem = deal.schedule[periodsPaid] ?? null
  const nextDueDate = nextScheduleItem ? nextScheduleItem.dueDate : null

  // Last payment: most recent receipt (items are sorted ascending, so last = most recent)
  const lastReceipt = paidReceipts[paidReceipts.length - 1]

  let lastPaymentTxId: string | undefined
  let lastPaymentExternalRefSource: string | undefined
  let lastPaymentExternalRef: string | undefined

  if (lastReceipt) {
    lastPaymentTxId = lastReceipt.txId

    // Parse canonicalExternalRefV1 format: "v1|source=<source>|ref=<ref>"
    try {
      const parsed = parseCanonicalString(lastReceipt.canonicalExternalRefV1)
      lastPaymentExternalRefSource = parsed.source
      lastPaymentExternalRef = parsed.ref
    } catch {
      // Fallback for old format or parsing errors
      const separatorIndex = lastReceipt.canonicalExternalRefV1.indexOf(':')
      if (separatorIndex !== -1) {
        lastPaymentExternalRefSource = lastReceipt.canonicalExternalRefV1.slice(0, separatorIndex)
        lastPaymentExternalRef = lastReceipt.canonicalExternalRefV1.slice(separatorIndex + 1)
      }
    }
  }

  // Contract-confirmed rent_to_own equity: only SENT receipts count (i.e. the
  // record_equity_payment call actually succeeded on-chain), mirroring the
  // "only SENT counts" rule already applied to TENANT_REPAYMENT above.
  const confirmedEquityPayments = equityItems.filter(
    (item) =>
      item.txType === TxType.RENT_TO_OWN_EQUITY_PAYMENT &&
      item.status === OutboxStatus.SENT,
  )
  const equityAccumulatedUsdcNum = confirmedEquityPayments.reduce((acc, item) => {
    const amount = parseFloat(String(item.payload.equityAmountUsdc ?? '0'))
    return acc + (isNaN(amount) ? 0 : amount)
  }, 0)
  const equityCapUsdcNum = parseFloat(computeEquityCapUsdc(deal))
  const equityPercentageBps =
    equityCapUsdcNum > 0
      ? Math.min(10_000, Math.round((equityAccumulatedUsdcNum / equityCapUsdcNum) * 10_000))
      : 0

  return {
    totalPaidUsdc: totalPaidUsdcNum.toFixed(6),
    periodsPaid,
    remainingPeriods,
    nextDueDate,
    ...(lastPaymentTxId !== undefined && { lastPaymentTxId }),
    ...(lastPaymentExternalRefSource !== undefined && { lastPaymentExternalRefSource }),
    ...(lastPaymentExternalRef !== undefined && { lastPaymentExternalRef }),
    equityAccumulatedUsdc: equityAccumulatedUsdcNum.toFixed(6),
    equityCapUsdc: equityCapUsdcNum.toFixed(6),
    equityPercentageBps,
    equityPaymentsConfirmed: confirmedEquityPayments.length,
  }
}
