import { describe, it, expect, vi } from 'vitest'
import { createTenantPaymentsRouter } from './tenantPayments.js'

vi.mock('../middleware/auth.js', () => ({
  authenticateToken: (req: any, res: any, next: any) => next()
}))
describe('TenantPayments Router', () => {
  it('should be defined', () => {
    expect(createTenantPaymentsRouter()).toBeDefined()
  })
})
