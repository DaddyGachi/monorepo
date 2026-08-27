import { describe, it, expect, vi } from 'vitest'
import { createKycRouter, createKycWebhookRouter } from './kyc.js'

vi.mock('../middleware/auth.js', () => ({
  authenticateToken: (req: any, res: any, next: any) => next()
}))
describe('Kyc Router', () => {
  it('should be defined', () => {
    expect(createKycRouter()).toBeDefined()
    expect(createKycWebhookRouter()).toBeDefined()
  })
})
