import { describe, it, expect, beforeEach, vi } from 'vitest'
import { erasureService } from './erasureService.js'
import * as dbModule from '../db.js'

describe('ErasureService Cascade', () => {
  let queryMock: ReturnType<typeof vi.fn>
  let poolMock: { query: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    queryMock = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id FROM erasure_requests')) {
        return { rows: [] }
      }
      if (sql.includes('SELECT * FROM erasure_requests WHERE id = $1')) {
        return {
          rows: [
            {
              id: 'req-1',
              user_id: 'user-123',
              status: 'pending',
              requested_at: new Date().toISOString(),
              confirm_by: new Date(Date.now() + 86400000).toISOString(),
              confirmed_at: null,
              confirmed_by: null,
            },
          ],
        }
      }
      if (sql.includes('SELECT email FROM users')) {
        return { rows: [{ email: 'user@example.com' }] }
      }
      return { rows: [], rowCount: 1 }
    })

    poolMock = { query: queryMock }
    vi.spyOn(dbModule, 'getPool').mockResolvedValue(poolMock as any)
  })

  it('confirms erasure and cascades across all PII tables in transaction', async () => {
    await erasureService.confirmErasure('req-1', 'admin-1')

    const queries = queryMock.mock.calls.map((c) => c[0])

    expect(queries).toContain('BEGIN')
    expect(queries).toContain('COMMIT')

    // Verify all covered tables are updated
    const fullSql = queries.join(' ')
    expect(fullSql).toContain('UPDATE users SET')
    expect(fullSql).toContain('UPDATE landlord_profiles SET')
    expect(fullSql).toContain('UPDATE onboarding_drafts SET')
    expect(fullSql).toContain('UPDATE kyc_documents SET')
    expect(fullSql).toContain('UPDATE messages SET')
    expect(fullSql).toContain('UPDATE tenant_documents SET')
    expect(fullSql).toContain('UPDATE support_messages SET')
    expect(fullSql).toContain('UPDATE notifications SET')
    expect(fullSql).toContain('UPDATE apartment_reviews SET')
    expect(fullSql).toContain('UPDATE sessions SET')
    expect(fullSql).toContain('UPDATE erasure_requests SET')
  })

  it('rolls back transaction if an error occurs during cascade', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('UPDATE messages SET')) {
        throw new Error('DB error')
      }
      if (sql.includes('SELECT id FROM erasure_requests')) {
        return { rows: [] }
      }
      if (sql.includes('SELECT * FROM erasure_requests WHERE id = $1')) {
        return {
          rows: [
            {
              id: 'req-1',
              user_id: 'user-123',
              status: 'pending',
              requested_at: new Date().toISOString(),
              confirm_by: new Date(Date.now() + 86400000).toISOString(),
              confirmed_at: null,
              confirmed_by: null,
            },
          ],
        }
      }
      return { rows: [] }
    })

    await expect(erasureService.confirmErasure('req-1', 'admin-1')).rejects.toThrow('DB error')

    const queries = queryMock.mock.calls.map((c) => c[0])
    expect(queries).toContain('BEGIN')
    expect(queries).toContain('ROLLBACK')
    expect(queries).not.toContain('COMMIT')
  })
})
