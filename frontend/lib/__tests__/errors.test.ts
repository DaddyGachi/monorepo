import { describe, expect, it, vi, beforeEach } from 'vitest'
import { parseBackendError, isNetworkError, getUserFriendlyError } from '@/lib/errors'

describe('parseBackendError', () => {
  it('parses BackendErrorResponse format', () => {
    const error = {
      error: { code: 'UNAUTHORIZED', message: 'auth required' },
    }
    const result = parseBackendError(error)
    expect(result.code).toBe('UNAUTHORIZED')
    expect(result.userMessage).toBe('Please sign in to continue')
  })

  it('uses backend message for unknown codes', () => {
    const error = {
      error: { code: 'CUSTOM_ERROR', message: 'Something custom' },
    }
    const result = parseBackendError(error)
    expect(result.code).toBe('CUSTOM_ERROR')
    expect(result.userMessage).toBe('Something custom')
  })

  it('handles ACCOUNT_FROZEN code', () => {
    const error = {
      error: { code: 'ACCOUNT_FROZEN', message: 'frozen' },
    }
    const result = parseBackendError(error)
    expect(result.code).toBe('ACCOUNT_FROZEN')
    expect(result.message).toBe('frozen')
  })

  it('parses Error objects', () => {
    const error = new Error('network issue')
    const result = parseBackendError(error)
    expect(result.code).toBe('UNKNOWN_ERROR')
    expect(result.userMessage).toBe('network issue')
  })

  it('parses string errors', () => {
    const result = parseBackendError('simple error')
    expect(result.code).toBe('UNKNOWN_ERROR')
    expect(result.userMessage).toBe('simple error')
  })

  it('returns default message for unknown types', () => {
    const result = parseBackendError(42)
    expect(result.code).toBe('UNKNOWN_ERROR')
    expect(result.userMessage).toBe('Something went wrong. Please try again')
  })

  it('uses custom defaultMessage', () => {
    const result = parseBackendError(null, 'Custom default')
    expect(result.userMessage).toBe('Custom default')
  })

  it('includes details when present', () => {
    const error = {
      error: { code: 'VALIDATION_ERROR', message: 'bad input', details: { field: 'email' } },
    }
    const result = parseBackendError(error)
    expect(result.details).toEqual({ field: 'email' })
  })
})

describe('isNetworkError', () => {
  it('returns true for Failed to fetch errors', () => {
    expect(isNetworkError(new Error('Failed to fetch'))).toBe(true)
  })

  it('returns true for NetworkError', () => {
    expect(isNetworkError(new Error('NetworkError occurred'))).toBe(true)
  })

  it('returns true for connection errors', () => {
    expect(isNetworkError(new Error('Cannot connect to backend'))).toBe(true)
  })

  it('returns false for other errors', () => {
    expect(isNetworkError(new Error('Something else'))).toBe(false)
  })

  it('returns false for non-Error values', () => {
    expect(isNetworkError(null)).toBe(false)
    expect(isNetworkError('string')).toBe(false)
  })
})

describe('getUserFriendlyError', () => {
  it('returns mapped message for known error codes', () => {
    const error = {
      error: { code: 'FORBIDDEN', message: 'no access' },
    }
    expect(getUserFriendlyError(error)).toBe('You do not have permission to perform this action')
  })

  it('appends "Try again." for unknown error codes', () => {
    const error = {
      error: { code: 'UNKNOWN_CODE', message: 'something happened' },
    }
    expect(getUserFriendlyError(error)).toBe('something happened Try again.')
  })

  it('appends "Try again." for generic Error objects', () => {
    expect(getUserFriendlyError(new Error('timeout'))).toBe('timeout Try again.')
  })

  it('uses custom defaultMessage', () => {
    expect(getUserFriendlyError(null, 'Custom msg')).toBe('Custom msg Try again.')
  })
})
