import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  JOB_INVENTORY,
  observeJobRun,
  getJobHealthReport,
  resetJobObservability,
  sumCounts,
} from './jobObservability.js'
import { requestContext } from '../request-context.js'

describe('job observability', () => {
  beforeEach(() => {
    resetJobObservability()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('records start, completion, duration and records processed', async () => {
    const record = await observeJobRun('data-retention', async () => ({ recordsProcessed: 7 }))

    expect(record.outcome).toBe('completed')
    expect(record.recordsProcessed).toBe(7)
    expect(record.durationMs).toBeGreaterThanOrEqual(0)
    expect(Date.parse(record.startedAt)).not.toBeNaN()
    expect(Date.parse(record.finishedAt)).not.toBeNaN()
  })

  it('distinguishes a run that did no work from a run that never happened', async () => {
    await observeJobRun('data-retention', async () => ({ recordsProcessed: 0 }))
    const report = getJobHealthReport()

    const ran = report.jobs.find(j => j.name === 'data-retention')!
    const neverRan = report.jobs.find(j => j.name === 'staking-finalizer')!

    expect(ran.state).toBe('healthy')
    expect(ran.lastRun?.recordsProcessed).toBe(0)
    expect(neverRan.state).toBe('never_ran')
    expect(neverRan.lastRun).toBeNull()
    expect(neverRan.secondsSinceLastRun).toBeNull()
  })

  it('reports a job that has stopped running as overdue — an absence, not an error', () => {
    // Nothing has run at all: every inventoried job is overdue.
    const report = getJobHealthReport()
    expect(report.overdueCount).toBe(JOB_INVENTORY.length)
    expect(report.failingCount).toBe(0)
  })

  it('clears overdue once a run lands, and re-raises it after the expected interval lapses', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))

    await observeJobRun('staking-finalizer', async () => ({ recordsProcessed: 1 }))
    expect(getJobHealthReport().jobs.find(j => j.name === 'staking-finalizer')!.overdue).toBe(false)

    // staking-finalizer is expected every 10s; two intervals is the grace window.
    vi.setSystemTime(new Date('2026-01-01T00:01:00Z'))
    const stale = getJobHealthReport().jobs.find(j => j.name === 'staking-finalizer')!
    expect(stale.overdue).toBe(true)
    expect(stale.secondsSinceLastRun).toBe(60)
  })

  it('records a failure with its correlation id instead of throwing', async () => {
    const record = await requestContext.run({ requestId: 'req-abc', queryCount: 0 }, () =>
      observeJobRun('late-payment-escalation', async () => {
        throw new Error('database unavailable')
      }),
    )

    expect(record.outcome).toBe('failed')
    expect(record.error).toBe('database unavailable')
    expect(record.correlationId).toBe('req-abc')

    const health = getJobHealthReport().jobs.find(j => j.name === 'late-payment-escalation')!
    expect(health.state).toBe('failing')
    expect(health.consecutiveFailures).toBe(1)
  })

  it('skips rather than stacking a second run while one is in flight', async () => {
    let release: (() => void) | undefined
    const gate = new Promise<void>(resolve => {
      release = resolve
    })

    const first = observeJobRun('scheduler', async () => {
      await gate
      return { recordsProcessed: 3 }
    })
    const second = await observeJobRun('scheduler', async () => ({ recordsProcessed: 99 }))

    expect(second.outcome).toBe('skipped_overrun')
    expect(second.recordsProcessed).toBe(0)

    release!()
    expect((await first).recordsProcessed).toBe(3)
  })

  it('sums the numeric fields of a job result into a records-processed count', () => {
    expect(sumCounts({ dealsProcessed: 2, installmentsProcessed: 5, note: 'x' })).toBe(7)
    expect(sumCounts({})).toBe(0)
  })

  it('documents every inventoried job well enough to operate it', () => {
    for (const entry of JOB_INVENTORY) {
      expect(entry.expectedIntervalMs).toBeGreaterThan(0)
      expect(entry.does.length).toBeGreaterThan(10)
      expect(entry.ifItDoesNotRun.length).toBeGreaterThan(10)
      expect(entry.healthy.length).toBeGreaterThan(10)
    }
  })
})
