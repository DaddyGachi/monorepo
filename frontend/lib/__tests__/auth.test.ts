import { describe, expect, it, vi, beforeEach } from 'vitest'
import { getToken, setToken, clearToken, isAuthenticated, logout, handleAuthRedirect } from '@/lib/auth'

const TOKEN_KEY = 'shelterflex_token'

describe('auth', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  describe('getToken', () => {
    it('returns null when no token is stored', () => {
      expect(getToken()).toBeNull()
    })

    it('returns the stored token', () => {
      localStorage.setItem(TOKEN_KEY, 'test-token')
      expect(getToken()).toBe('test-token')
    })
  })

  describe('setToken', () => {
    it('stores the token in localStorage', () => {
      setToken('my-token')
      expect(localStorage.getItem(TOKEN_KEY)).toBe('my-token')
    })

    it('overwrites an existing token', () => {
      setToken('first')
      setToken('second')
      expect(localStorage.getItem(TOKEN_KEY)).toBe('second')
    })
  })

  describe('clearToken', () => {
    it('removes the token from localStorage', () => {
      localStorage.setItem(TOKEN_KEY, 'to-clear')
      clearToken()
      expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
    })

    it('does not throw when no token exists', () => {
      expect(() => clearToken()).not.toThrow()
    })
  })

  describe('isAuthenticated', () => {
    it('returns false when no token exists', () => {
      expect(isAuthenticated()).toBe(false)
    })

    it('returns true when a token exists', () => {
      localStorage.setItem(TOKEN_KEY, 'valid-token')
      expect(isAuthenticated()).toBe(true)
    })

    it('returns false after token is cleared', () => {
      localStorage.setItem(TOKEN_KEY, 'valid-token')
      clearToken()
      expect(isAuthenticated()).toBe(false)
    })
  })

  describe('logout', () => {
    it('clears the token', () => {
      localStorage.setItem(TOKEN_KEY, 'session-token')
      logout()
      expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
    })

    it('redirects to homepage', () => {
      let capturedHref = ''
      const locationObj = {
        get href() { return capturedHref },
        set href(v: string) { capturedHref = v },
        pathname: '/',
      }
      Object.defineProperty(window, 'location', { value: locationObj, writable: true, configurable: true })

      logout()
      expect(capturedHref).toBe('/')
    })
  })

  describe('handleAuthRedirect', () => {
    it('redirects to the provided returnTo URL', () => {
      let capturedHref = ''
      const locationObj = {
        get href() { return capturedHref },
        set href(v: string) { capturedHref = v },
        pathname: '/',
      }
      Object.defineProperty(window, 'location', { value: locationObj, writable: true, configurable: true })

      handleAuthRedirect(encodeURIComponent('/dashboard'))
      expect(capturedHref).toBe('/dashboard')
    })

    it('redirects to / when no returnTo is provided and current path differs', () => {
      let capturedHref = ''
      const locationObj = {
        get href() { return capturedHref },
        set href(v: string) { capturedHref = v },
        pathname: '/login',
      }
      Object.defineProperty(window, 'location', { value: locationObj, writable: true, configurable: true })

      handleAuthRedirect()
      expect(capturedHref).toBe('/')
    })

    it('does not redirect when target matches current path', () => {
      let capturedHref = ''
      const locationObj = {
        get href() { return capturedHref },
        set href(v: string) { capturedHref = v },
        pathname: '/dashboard',
      }
      Object.defineProperty(window, 'location', { value: locationObj, writable: true, configurable: true })

      handleAuthRedirect(encodeURIComponent('/dashboard'))
      expect(capturedHref).toBe('')
    })
  })
})
