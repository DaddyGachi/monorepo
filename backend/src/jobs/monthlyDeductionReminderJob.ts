import { sendMonthlyDeductionAdvanceNotices } from '../services/salaryDeductionService.js'
import { logger } from '../utils/logger.js'
import { observeJobRun, sumCounts } from './jobObservability.js'

/**
 * Sends advance deduction notices to employer webhook URLs for the upcoming pay cycle.
 */
export class MonthlyDeductionReminderJob {
  private interval: NodeJS.Timeout | null = null
  private processingPromise: Promise<void> | null = null

  constructor(private pollIntervalMs: number = 24 * 60 * 60 * 1000) {}

  start(): void {
    if (this.interval) return
    logger.info('Starting MonthlyDeductionReminderJob', { pollIntervalMs: this.pollIntervalMs })
    void this.poll()
    this.interval = setInterval(() => {
      this.processingPromise = this.poll().finally(() => {
        this.processingPromise = null
      })
    }, this.pollIntervalMs)
    if (this.interval.unref) this.interval.unref()
  }

  async stop(): Promise<void> {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
    if (this.processingPromise) {
      await this.processingPromise
    }
    logger.info('Stopped MonthlyDeductionReminderJob')
  }

  async poll(referenceDate?: Date): Promise<void> {
    await observeJobRun('monthly-deduction-reminder', async () => {
      const result = await sendMonthlyDeductionAdvanceNotices(referenceDate)
      logger.info('MonthlyDeductionReminderJob completed', result)
      return { recordsProcessed: sumCounts(result) }
    })
  }
}
