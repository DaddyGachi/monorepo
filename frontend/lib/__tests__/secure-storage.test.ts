import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { secureStorage } from '@/lib/secure-storage'

describe('secureStorage', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('setItem / getItem', () => {
    it('stores and retrieves a value', async () => {
      await secureStorage.setItem('test-key', 'test-value')
      const result = await secureStorage.getItem('test-key')
      expect(result).toBe('test-value')
    })

    it('returns null for a nonexistent key', async () => {
      const result = await secureStorage.getItem('nonexistent')
      expect(result).toBeNull()
    })

    it('stores values under a secure_ prefix', async () => {
      await secureStorage.setItem('prefixed', 'val')
      const keys = Object.keys(localStorage)
      expect(keys.some(k => k.startsWith('secure_'))).toBe(true)
    })

    it('overwrites an existing value', async () => {
      await secureStorage.setItem('key', 'first')
      await secureStorage.setItem('key', 'second')
      const result = await secureStorage.getItem('key')
      expect(result).toBe('second')
    })
  })

  describe('removeItem', () => {
    it('removes the item', async () => {
      await secureStorage.setItem('to-remove', 'value')
      secureStorage.removeItem('to-remove')
      const result = await secureStorage.getItem('to-remove')
      expect(result).toBeNull()
    })
  })

  describe('clear', () => {
    it('removes only secure_ prefixed items', async () => {
      await secureStorage.setItem('s1', 'v1')
      await secureStorage.setItem('s2', 'v2')
      localStorage.setItem('other_key', 'other_value')

      secureStorage.clear()

      expect(localStorage.getItem('other_key')).toBe('other_value')
      expect(await secureStorage.getItem('s1')).toBeNull()
      expect(await secureStorage.getItem('s2')).toBeNull()
    })
  })

  describe('TTL / expiration', () => {
    it('returns null when the item has expired', async () => {
      await secureStorage.setItem('ttl-key', 'value', 5000)

      vi.advanceTimersByTime(6000)

      const result = await secureStorage.getItem('ttl-key')
      expect(result).toBeNull()
    })

    it('returns the value before expiration', async () => {
      await secureStorage.setItem('ttl-key', 'value', 10000)

      vi.advanceTimersByTime(5000)

      const result = await secureStorage.getItem('ttl-key')
      expect(result).toBe('value')
    })
  })

  describe('setSessionItem / getSessionItem', () => {
    it('stores and retrieves from sessionStorage', async () => {
      await secureStorage.setSessionItem('session-key', 'session-value')
      const result = await secureStorage.getSessionItem('session-key')
      expect(result).toBe('session-value')
    })

    it('returns null for nonexistent session item', async () => {
      const result = await secureStorage.getSessionItem('nonexistent')
      expect(result).toBeNull()
    })

    it('session items use sessionStorage, not localStorage', async () => {
      await secureStorage.setSessionItem('s-key', 's-val')
      expect(localStorage.getItem('secure_s-key')).toBeNull()
      expect(sessionStorage.getItem('secure_s-key')).not.toBeNull()
    })
  })

  describe('removeSessionItem', () => {
    it('removes the session item', async () => {
      await secureStorage.setSessionItem('to-remove', 'val')
      secureStorage.removeSessionItem('to-remove')
      const result = await secureStorage.getSessionItem('to-remove')
      expect(result).toBeNull()
    })
  })

  describe('session TTL', () => {
    it('returns null for expired session items', async () => {
      await secureStorage.setSessionItem('expiring', 'value', 1000)

      vi.advanceTimersByTime(2000)

      const result = await secureStorage.getSessionItem('expiring')
      expect(result).toBeNull()
    })
  })
})
