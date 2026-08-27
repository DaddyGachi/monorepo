import { describe, it, expect, vi } from 'vitest'
import { createComplianceReportRouter } from './complianceReport.js'

vi.mock('../middleware/auth.js', () => ({
  authenticateToken: (req: any, res: any, next: any) => next()
}))
vi.mock('../middleware/rbac.js', () => ({
  requireRole: () => (req: any, res: any, next: any) => next()
}))
describe('ComplianceReport Router', () => {
  it('should be defined', () => {
    expect(createComplianceReportRouter()).toBeDefined()
  })
})
