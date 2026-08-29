import { describe, expect, it } from 'vitest'
import { ScheduleItemStatus } from '../../models/deal.js'
import {
  computeEquityCapUsdc,
  dealIdToRentToOwnBytes32,
  ngnToUsdcDecimal,
  toSorobanReasonSymbol,
  wouldExceedEquityCap,
} from './rentToOwnConversion.js'

describe('dealIdToRentToOwnBytes32', () => {
  it('is deterministic and produces a 32-byte (64 hex char) digest', () => {
    const a = dealIdToRentToOwnBytes32('deal-123')
    const b = dealIdToRentToOwnBytes32('deal-123')
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })

  it('differs for different deal IDs', () => {
    expect(dealIdToRentToOwnBytes32('deal-123')).not.toBe(dealIdToRentToOwnBytes32('deal-456'))
  })
})

describe('ngnToUsdcDecimal', () => {
  it('converts using the supplied rate and returns 6 decimal places', () => {
    expect(ngnToUsdcDecimal(160_000, 1600)).toBe('100.000000')
  })

  it('falls back to a positive default when no rate is supplied', () => {
    expect(ngnToUsdcDecimal(1600)).toBe('1.000000')
  })
})

describe('computeEquityCapUsdc', () => {
  it('derives the cap from financedAmountNgn', () => {
    expect(computeEquityCapUsdc({ financedAmountNgn: 960_000 })).toBe(
      ngnToUsdcDecimal(960_000),
    )
  })
})

describe('wouldExceedEquityCap', () => {
  const deal = { financedAmountNgn: 300 }

  it('allows a payment that lands exactly at the cap', () => {
    const schedule = [
      { period: 1, dueDate: '', amountNgn: 100, status: ScheduleItemStatus.PAID },
      { period: 2, dueDate: '', amountNgn: 100, status: ScheduleItemStatus.PAID },
    ]
    expect(wouldExceedEquityCap(deal, schedule, 100)).toBe(false)
  })

  it('rejects a payment that pushes accumulated equity over the cap', () => {
    const schedule = [
      { period: 1, dueDate: '', amountNgn: 100, status: ScheduleItemStatus.PAID },
      { period: 2, dueDate: '', amountNgn: 100, status: ScheduleItemStatus.PAID },
      { period: 3, dueDate: '', amountNgn: 100, status: ScheduleItemStatus.PAID },
    ]
    // All three periods already paid (sum == cap); recording period 1 again
    // mirrors calling record_equity_payment a second time for the same
    // payment — the contract's real overflow scenario.
    expect(wouldExceedEquityCap(deal, schedule, 100)).toBe(true)
  })

  it('ignores non-PAID items when summing accumulated equity', () => {
    const schedule = [
      { period: 1, dueDate: '', amountNgn: 100, status: ScheduleItemStatus.PAID },
      { period: 2, dueDate: '', amountNgn: 100, status: ScheduleItemStatus.UPCOMING },
    ]
    expect(wouldExceedEquityCap(deal, schedule, 100)).toBe(false)
  })
})

describe('toSorobanReasonSymbol', () => {
  it('sanitizes non-alphanumeric characters and truncates to 32 chars', () => {
    expect(toSorobanReasonSymbol('missed payment #2!')).toBe('missed_payment__2_')
  })

  it('falls back to "default" for empty/undefined reasons', () => {
    expect(toSorobanReasonSymbol(undefined)).toBe('default')
    expect(toSorobanReasonSymbol('')).toBe('default')
  })
})
