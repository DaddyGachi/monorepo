import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/analytics', () => ({
  analytics: {
    setConsent: vi.fn(),
    initialize: vi.fn(),
    track: vi.fn(),
    getEvents: vi.fn().mockReturnValue([]),
    reset: vi.fn(),
  },
}))

vi.mock('@/lib/performance-tracking', () => ({
  performanceTracking: {
    startTracking: vi.fn(),
    stopTracking: vi.fn(),
    getMetrics: vi.fn().mockReturnValue({}),
    reset: vi.fn(),
  },
}))

describe('consentManager', () => {
  let consentManager: any

  beforeEach(async () => {
    localStorage.clear()
    vi.useFakeTimers()

    // Reset singleton by clearing module cache
    vi.resetModules()
    const mod = await import('@/lib/consent-manager')
    consentManager = mod.consentManager
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('consentAll', () => {
    it('sets all preferences to true', () => {
      consentManager.consentAll()
      const prefs = consentManager.getPreferences()
      expect(prefs.analytics).toBe(true)
      expect(prefs.performance).toBe(true)
      expect(prefs.functional).toBe(true)
      expect(prefs.marketing).toBe(true)
      expect(prefs.acceptedAll).toBe(true)
      expect(prefs.rejectedAll).toBe(false)
    })

    it('persists preferences to localStorage', () => {
      consentManager.consentAll()
      const stored = localStorage.getItem('consent_preferences')
      expect(stored).not.toBeNull()
      const parsed = JSON.parse(stored!)
      expect(parsed.analytics).toBe(true)
    })
  })

  describe('rejectAll', () => {
    it('sets all preferences to false', () => {
      consentManager.rejectAll()
      const prefs = consentManager.getPreferences()
      expect(prefs.analytics).toBe(false)
      expect(prefs.performance).toBe(false)
      expect(prefs.functional).toBe(false)
      expect(prefs.marketing).toBe(false)
      expect(prefs.rejectedAll).toBe(true)
      expect(prefs.acceptedAll).toBe(false)
    })
  })

  describe('updatePreferences', () => {
    it('partially updates preferences', () => {
      consentManager.updatePreferences({ analytics: true })
      expect(consentManager.getPreferences().analytics).toBe(true)
      expect(consentManager.getPreferences().marketing).toBe(false)
    })
  })

  describe('hasConsent', () => {
    it('returns false by default', () => {
      expect(consentManager.hasConsent('analytics')).toBe(false)
    })

    it('returns true after consent is given', () => {
      consentManager.consentAll()
      expect(consentManager.hasConsent('analytics')).toBe(true)
    })
  })

  describe('hasGivenConsent', () => {
    it('returns false when no consent exists', () => {
      expect(consentManager.hasGivenConsent()).toBe(false)
    })

    it('returns true after consent is given', () => {
      consentManager.consentAll()
      expect(consentManager.hasGivenConsent()).toBe(true)
    })
  })

  describe('shouldShowBanner', () => {
    it('returns true when no consent has been given', () => {
      expect(consentManager.shouldShowBanner()).toBe(true)
    })

    it('returns false after consent is given', () => {
      consentManager.consentAll()
      expect(consentManager.shouldShowBanner()).toBe(false)
    })
  })

  describe('getCategories', () => {
    it('returns all consent categories', () => {
      const categories = consentManager.getCategories()
      expect(categories.length).toBe(5)
      expect(categories.map((c: any) => c.id)).toContain('necessary')
      expect(categories.map((c: any) => c.id)).toContain('analytics')
    })

    it('marks necessary cookies as required', () => {
      const necessary = consentManager.getCategory('necessary')
      expect(necessary?.required).toBe(true)
    })
  })

  describe('getCookieInfo', () => {
    it('returns only necessary cookies when no consent given', () => {
      const info = consentManager.getCookieInfo()
      expect(info.activeCookies).toContain('session')
      expect(info.activeCookies).not.toContain('analytics_session')
    })

    it('includes analytics cookies after consent', () => {
      consentManager.consentAll()
      const info = consentManager.getCookieInfo()
      expect(info.activeCookies).toContain('analytics_session')
    })
  })

  describe('onConsentChange', () => {
    it('calls the callback when consent changes', () => {
      const callback = vi.fn()
      consentManager.onConsentChange(callback)
      consentManager.consentAll()
      expect(callback).toHaveBeenCalled()
    })

    it('unsubscribes when the returned function is called', () => {
      const callback = vi.fn()
      const unsubscribe = consentManager.onConsentChange(callback)
      unsubscribe()
      consentManager.consentAll()
      expect(callback).not.toHaveBeenCalled()
    })
  })

  describe('deleteUserData', () => {
    it('resets all preferences', () => {
      consentManager.consentAll()
      consentManager.deleteUserData()
      const prefs = consentManager.getPreferences()
      expect(prefs.analytics).toBe(false)
      expect(prefs.timestamp).toBe(0)
    })
  })

  describe('banner config', () => {
    it('returns default banner config', () => {
      const config = consentManager.getBannerConfig()
      expect(config.title).toBe('Privacy & Cookie Consent')
      expect(config.position).toBe('bottom')
    })

    it('allows updating banner config', () => {
      consentManager.updateBannerConfig({ position: 'top' })
      expect(consentManager.getBannerConfig().position).toBe('top')
    })
  })

  describe('privacy rights', () => {
    it('returns an array of rights', () => {
      const rights = consentManager.getPrivacyRights()
      expect(rights.rights.length).toBeGreaterThan(0)
      expect(rights.contactInfo).toBe('privacy@shelterflex.com')
    })
  })

  describe('loading from localStorage', () => {
    it('loads existing preferences on initialization', async () => {
      const prefs = {
        analytics: true,
        performance: false,
        functional: true,
        marketing: false,
        version: '1.0',
        timestamp: Date.now(),
      }
      localStorage.setItem('consent_preferences', JSON.stringify(prefs))

      vi.resetModules()
      const mod = await import('@/lib/consent-manager')
      const manager = mod.consentManager
      expect(manager.getPreferences().analytics).toBe(true)
      expect(manager.getPreferences().functional).toBe(true)
    })
  })
})
