/**
 * Conversion helpers for wiring Postgres-backed deals into the rent_to_own
 * Soroban contract.
 *
 * rent_to_own identifies deals with `BytesN<32>`, deal_escrow identifies them
 * with `String`, and the backend's dealStore uses a plain UUID string. These
 * do not share an encoding, so a deterministic SHA-256 digest of the backend
 * dealId is used as the rent_to_own contract deal ID (same derivation
 * strategy already used for outbox txIds — see outbox/canonicalization.ts).
 *
 * Amounts are converted NGN -> USDC using FX_RATE_NGN_PER_USDC (the same
 * fallback rate the stub conversion provider uses elsewhere in this codebase)
 * since deals are recorded in NGN but rent_to_own accounts strictly in USDC.
 */

import { createHash } from 'node:crypto'
import { ScheduleItem, ScheduleItemStatus } from '../../models/deal.js'

const DEFAULT_FX_RATE_NGN_PER_USDC = 1600

/** Tolerance for float rounding when comparing accumulated equity to the cap. */
const EQUITY_EPSILON_NGN = 1e-6

/**
 * Deterministically maps a backend dealId (UUID string) to the BytesN<32>
 * hex string rent_to_own expects as its `deal_id` argument.
 */
export function dealIdToRentToOwnBytes32(dealId: string): string {
  return createHash('sha256').update(dealId, 'utf8').digest('hex')
}

function getFxRateNgnPerUsdc(): number {
  const raw = process.env.FX_RATE_NGN_PER_USDC
  const parsed = raw ? Number(raw) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_FX_RATE_NGN_PER_USDC
}

/** Converts an NGN amount to a USDC decimal string with 6 decimal places. */
export function ngnToUsdcDecimal(amountNgn: number, fxRateNgnPerUsdc = getFxRateNgnPerUsdc()): string {
  return (amountNgn / fxRateNgnPerUsdc).toFixed(6)
}

/**
 * rent_to_own's `property_value_usdc` equity cap for a deal, derived from
 * the total financed amount (the portion of the property's value the tenant
 * builds equity toward).
 */
export function computeEquityCapUsdc(deal: { financedAmountNgn: number }): string {
  return ngnToUsdcDecimal(deal.financedAmountNgn)
}

/** Sum of amountNgn for schedule items already recorded as PAID. */
export function sumAccumulatedEquityNgn(schedule: ScheduleItem[]): number {
  return schedule
    .filter((item) => item.status === ScheduleItemStatus.PAID)
    .reduce((sum, item) => sum + item.amountNgn, 0)
}

/**
 * Mirrors rent_to_own's `record_equity_payment` overflow guard: rejects a
 * payment that would push accumulated equity over the deal's financed
 * amount. `schedule` must reflect state *before* the target period is
 * updated — a period already marked PAID is included in the accumulated
 * sum, so re-marking the same period paid again (a duplicate/replayed
 * payment) is correctly flagged as an overflow, exactly as the contract
 * would reject a duplicate `record_equity_payment` call.
 */
export function wouldExceedEquityCap(
  deal: { financedAmountNgn: number },
  schedule: ScheduleItem[],
  targetAmountNgn: number,
): boolean {
  const capNgn = deal.financedAmountNgn
  const accumulatedNgn = sumAccumulatedEquityNgn(schedule)
  return accumulatedNgn + targetAmountNgn > capNgn + EQUITY_EPSILON_NGN
}

/**
 * Sanitizes a free-form default reason into a Soroban `Symbol`-safe token
 * (alphanumeric + underscore, capped at 32 chars).
 */
export function toSorobanReasonSymbol(reason: string | undefined | null): string {
  const cleaned = (reason ?? '').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 32)
  return cleaned.length > 0 ? cleaned : 'default'
}
