import { describe, expect, it, vi, beforeEach } from 'vitest'
import { retryWithBackoff, withRetry } from '@/lib/retryLogic'

describe('retryWithBackoff', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    const result = await retryWithBackoff(fn)
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries on retryable status code errors', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce({ status: 500 })
      .mockResolvedValue('ok')

    const result = await retryWithBackoff(fn, { maxRetries: 2, initialDelayMs: 1 })
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  }, 15000)

  it('retries on network errors (TypeError with fetch)', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue('ok')

    const result = await retryWithBackoff(fn, { maxRetries: 2, initialDelayMs: 1 })
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  }, 15000)

  it('does not retry on non-retryable errors', async () => {
    const fn = vi.fn().mockRejectedValue({ status: 400 })

    await expect(retryWithBackoff(fn, { maxRetries: 3, initialDelayMs: 1 })).rejects.toThrow()
    expect(fn).toHaveBeenCalledTimes(1)
  }, 10000)

  it('does not retry on 401', async () => {
    const fn = vi.fn().mockRejectedValue({ status: 401 })

    await expect(retryWithBackoff(fn, { maxRetries: 3, initialDelayMs: 1 })).rejects.toThrow()
    expect(fn).toHaveBeenCalledTimes(1)
  }, 10000)

  it('throws after exhausting all retries', async () => {
    const fn = vi.fn().mockRejectedValue({ status: 503 })

    await expect(retryWithBackoff(fn, { maxRetries: 2, initialDelayMs: 1 })).rejects.toThrow()
    expect(fn).toHaveBeenCalledTimes(3)
  }, 15000)

  it('calls onRetry callback', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce({ status: 500 })
      .mockResolvedValue('ok')
    const onRetry = vi.fn()

    const result = await retryWithBackoff(fn, { maxRetries: 2, initialDelayMs: 1, onRetry })

    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error))
    expect(result).toBe('ok')
  }, 15000)

  it('uses default options when none provided', async () => {
    const fn = vi.fn().mockRejectedValue({ status: 500 })

    await expect(retryWithBackoff(fn)).rejects.toThrow()
    expect(fn).toHaveBeenCalledTimes(4)
  }, 30000)

  it('does not sleep on success', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    const sleepSpy = vi.spyOn(globalThis, 'setTimeout')

    await retryWithBackoff(fn)

    expect(sleepSpy).not.toHaveBeenCalled()
  })
})

describe('withRetry', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns a function that retries on failure', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce({ status: 500 })
      .mockResolvedValue('result')

    const retried = withRetry(fn, { maxRetries: 2, initialDelayMs: 1 })
    const result = await retried('arg1')

    expect(result).toBe('result')
    expect(fn).toHaveBeenCalledWith('arg1')
    expect(fn).toHaveBeenCalledTimes(2)
  }, 15000)

  it('passes arguments through to the original function', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    const retried = withRetry(fn)

    await retried('a', 'b', 'c')

    expect(fn).toHaveBeenCalledWith('a', 'b', 'c')
  })
})
