import { describe, expect, it } from 'vitest'
import {
  deriveInstalmentStatus,
  buildScheduleView,
  summarizePayments,
  hasArrears,
  type InstalmentInput,
} from '@/lib/installmentSchedule'

const NOW = new Date('2026-06-15T00:00:00.000Z')

function inst(period: number, dueDate: string, paid: boolean, amountNgn = 100000): InstalmentInput {
  return { period, dueDate, amountNgn, paid }
}

describe('deriveInstalmentStatus', () => {
  it('labels paid instalments paid regardless of date', () => {
    expect(deriveInstalmentStatus(inst(1, '2026-01-01T00:00:00Z', true), NOW)).toBe('paid')
  })

  it('labels unpaid past-due instalments overdue', () => {
    expect(deriveInstalmentStatus(inst(1, '2026-05-01T00:00:00Z', false), NOW)).toBe('overdue')
  })

  it('labels unpaid instalments due within the window as due', () => {
    expect(deriveInstalmentStatus(inst(1, '2026-06-18T00:00:00Z', false), NOW)).toBe('due')
  })

  it('labels far-future unpaid instalments upcoming', () => {
    expect(deriveInstalmentStatus(inst(1, '2026-09-01T00:00:00Z', false), NOW)).toBe('upcoming')
  })
})

describe('buildScheduleView', () => {
  it('sorts by period and attaches status', () => {
    const view = buildScheduleView(
      [inst(3, '2026-09-01T00:00:00Z', false), inst(1, '2026-04-01T00:00:00Z', true), inst(2, '2026-05-01T00:00:00Z', false)],
      NOW,
    )
    expect(view.map((v) => v.period)).toEqual([1, 2, 3])
    expect(view.map((v) => v.status)).toEqual(['paid', 'overdue', 'upcoming'])
  })
})

describe('summarizePayments', () => {
  const schedule = [
    inst(1, '2026-03-01T00:00:00Z', true),
    inst(2, '2026-04-01T00:00:00Z', true),
    inst(3, '2026-05-01T00:00:00Z', false), // overdue
    inst(4, '2026-09-01T00:00:00Z', false), // upcoming
  ]

  it('matches paid/owed totals and progress', () => {
    const s = summarizePayments(schedule, NOW)
    expect(s.totalDue).toBe(400000)
    expect(s.totalPaid).toBe(200000)
    expect(s.outstanding).toBe(200000)
    expect(s.progressPercent).toBe(50)
    expect(s.monthsRemaining).toBe(2)
  })

  it('reports the next unpaid payment', () => {
    const s = summarizePayments(schedule, NOW)
    expect(s.nextPayment).toEqual({ period: 3, dueDate: '2026-05-01T00:00:00Z', amountNgn: 100000 })
  })

  it('computes arrears from overdue instalments', () => {
    const s = summarizePayments(schedule, NOW)
    expect(s.overdueSince).toBe('2026-05-01T00:00:00Z')
    expect(s.arrearsAmount).toBe(100000)
  })

  it('handles a fully paid schedule', () => {
    const paid = [inst(1, '2026-01-01T00:00:00Z', true), inst(2, '2026-02-01T00:00:00Z', true)]
    const s = summarizePayments(paid, NOW)
    expect(s.progressPercent).toBe(100)
    expect(s.nextPayment).toBeNull()
    expect(s.overdueSince).toBeNull()
    expect(s.arrearsAmount).toBe(0)
  })

  it('guards an empty schedule', () => {
    const s = summarizePayments([], NOW)
    expect(s.totalDue).toBe(0)
    expect(s.progressPercent).toBe(0)
    expect(s.nextPayment).toBeNull()
  })
})

describe('hasArrears', () => {
  it('is true when any instalment is overdue', () => {
    expect(hasArrears([inst(1, '2026-05-01T00:00:00Z', false)], NOW)).toBe(true)
    expect(hasArrears([inst(1, '2026-05-01T00:00:00Z', true)], NOW)).toBe(false)
  })

  it('returns false for an empty schedule', () => {
    expect(hasArrears([], NOW)).toBe(false)
  })

  it('returns false when all instalments are paid even if past due', () => {
    expect(hasArrears([inst(1, '2026-01-01T00:00:00Z', true)], NOW)).toBe(false)
  })

  it('returns true when even one of many instalments is overdue', () => {
    const instalments = [
      inst(1, '2026-03-01T00:00:00Z', true),
      inst(2, '2026-04-01T00:00:00Z', true),
      inst(3, '2026-05-01T00:00:00Z', false),
      inst(4, '2026-09-01T00:00:00Z', false),
    ]
    expect(hasArrears(instalments, NOW)).toBe(true)
  })
})

describe('deriveInstalmentStatus - boundary cases', () => {
  it('labels instalment due exactly on the boundary as due', () => {
    // Due date = exactly DUE_SOON_WINDOW_DAYS (7) from now
    const dueDate = new Date(NOW.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
    expect(deriveInstalmentStatus(inst(1, dueDate, false), NOW)).toBe('due')
  })

  it('labels instalment due just past the boundary as upcoming', () => {
    const dueDate = new Date(NOW.getTime() + 8 * 24 * 60 * 60 * 1000).toISOString()
    expect(deriveInstalmentStatus(inst(1, dueDate, false), NOW)).toBe('upcoming')
  })

  it('labels instalment due yesterday as overdue', () => {
    const dueDate = new Date(NOW.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString()
    expect(deriveInstalmentStatus(inst(1, dueDate, false), NOW)).toBe('overdue')
  })
})

describe('summarizePayments - edge cases', () => {
  it('handles schedule with all overdue instalments', () => {
    const schedule = [
      inst(1, '2026-01-01T00:00:00Z', false),
      inst(2, '2026-02-01T00:00:00Z', false),
    ]
    const s = summarizePayments(schedule, NOW)
    expect(s.arrearsAmount).toBe(200_000)
    expect(s.overdueSince).toBe('2026-01-01T00:00:00Z')
    expect(s.progressPercent).toBe(0)
  })

  it('handles schedule with all upcoming instalments', () => {
    const schedule = [
      inst(1, '2026-09-01T00:00:00Z', false),
      inst(2, '2026-10-01T00:00:00Z', false),
    ]
    const s = summarizePayments(schedule, NOW)
    expect(s.arrearsAmount).toBe(0)
    expect(s.overdueSince).toBeNull()
    expect(s.progressPercent).toBe(0)
    expect(s.monthsRemaining).toBe(2)
  })

  it('nextPayment selects the earliest unpaid instalment', () => {
    const schedule = [
      inst(3, '2026-09-01T00:00:00Z', false),
      inst(1, '2026-07-01T00:00:00Z', false),
      inst(2, '2026-08-01T00:00:00Z', true),
    ]
    const s = summarizePayments(schedule, NOW)
    expect(s.nextPayment?.period).toBe(1)
  })

  it('progressPercent rounds correctly', () => {
    const schedule = [
      inst(1, '2026-01-01T00:00:00Z', true),
      inst(2, '2026-02-01T00:00:00Z', false),
      inst(3, '2026-03-01T00:00:00Z', false),
    ]
    const s = summarizePayments(schedule, NOW)
    // 100000 / 300000 = 33.33% → rounds to 33
    expect(s.progressPercent).toBe(33)
  })
})
