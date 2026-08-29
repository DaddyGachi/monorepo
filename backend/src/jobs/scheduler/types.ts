export enum JobStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  DEAD = 'dead',
  CANCELLED = 'cancelled',
}

export interface ScheduledJob {
  id: string
  name: string
  handler: string
  payload: Record<string, unknown>
  status: JobStatus
  /** 1 = highest priority, 10 = lowest priority */
  priority: number
  cronExpression: string | null
  nextRunAt: Date
  lastRunAt: Date | null
  runCount: number
  retryCount: number
  maxRetries: number
  lastError: string | null
  createdAt: Date
  updatedAt: Date
  // Lease-based deduplication fields
  leaseHolder: string | null
  leaseAcquiredAt: Date | null
  leaseExpiresAt: Date | null
  /** Monotonic fencing token to prevent stale lease holders from executing */
  fencingToken: number | null
}

export interface CreateJobInput {
  name: string
  handler: string
  payload?: Record<string, unknown>
  /** 1 = highest, 10 = lowest. Defaults to 5. */
  priority?: number
  cronExpression?: string
  nextRunAt?: Date
  maxRetries?: number
}

/**
 * A handler may return the number of records it acted on. Doing so lets the
 * scheduler distinguish "the job ran" from "the job did its work" — a run that
 * completes having processed nothing looks identical otherwise.
 */
export type JobHandler = (job: ScheduledJob) => Promise<{ recordsProcessed?: number } | void>

export enum JobRunStatus {
  STARTED = 'started',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export interface JobRunHistory {
  id: string
  jobId: string
  jobName: string
  handler: string
  workerId: string
  status: JobRunStatus
  startedAt: Date
  completedAt: Date | null
  durationMs: number | null
  errorMessage: string | null
  payload: Record<string, unknown>
  /** Fencing token used for this execution to prevent stale holder execution */
  fencingToken: number | null
  createdAt: Date
}
