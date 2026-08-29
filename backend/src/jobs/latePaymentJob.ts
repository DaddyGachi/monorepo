import { getLatePaymentConfig } from '../config/latePayment.js'
import { latePaymentEscalationService } from '../services/latePaymentEscalationService.js'
import { logger } from '../utils/logger.js'
import { observeJobRun, sumCounts } from './jobObservability.js'

/**
 * Polls active deals and runs the late-payment escalation matrix.
 * Follows the StakingFinalizer interval-worker pattern.
 */
export class LatePaymentJob {
  private interval: NodeJS.Timeout | null = null
  private processingPromise: Promise<void> | null = null

  constructor(private pollIntervalMs: number = getLatePaymentConfig().jobPollIntervalMs) {}

  start(): void {
    if (this.interval) return
    logger.info('Starting LatePaymentJob', { pollIntervalMs: this.pollIntervalMs })
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
      logger.info('LatePaymentJob waiting for in-progress run...')
      await this.processingPromise
    }
    logger.info('Stopped LatePaymentJob')
  }

  async poll(now?: Date): Promise<void> {
    await observeJobRun('late-payment-escalation', async () => {
      const result = await latePaymentEscalationService.processAllActiveDeals(now ?? new Date())
      logger.info('LatePaymentJob completed', { ...result })
      return { recordsProcessed: sumCounts(result) }
    })
  }
}
