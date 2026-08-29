import { describe, it, expect, beforeEach, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import { createAccountRouter } from './account.js'
import { errorHandler } from '../middleware/errorHandler.js'
import { requestIdMiddleware } from '../middleware/requestId.js'
import { sessionStore, userStore } from '../models/authStore.js'
import { softDeleteUser } from '../services/dataRetentionService.js'

vi.mock('../services/dataRetentionService.js', () => ({
  softDeleteUser: vi.fn(),
}))

// Deliberately not importing from '../test-helpers.js' here: it imports the full
// app (createApp from '../app.js') at module scope, which pulls in
// @sentry/profiling-node's native binding — unrelated to what this suite tests
// and best avoided in a focused route-level test.
function expectErrorShape(
  res: request.Response,
  expectedCode: string,
  expectedStatus: number,
): void {
  expect(res.status).toBe(expectedStatus)
  expect(res.body).toHaveProperty('error')
  expect(res.body.error).toHaveProperty('code', expectedCode)
  expect(res.body.error).toHaveProperty('message')
  expect(typeof res.body.error.message).toBe('string')
}

/**
 * Route-level tests only. This intentionally mounts createAccountRouter() directly
 * (not the full app via createApp()) so the real authenticateToken middleware and
 * real in-memory session/user stores are exercised without pulling in unrelated
 * app-wide wiring.
 */
function buildApp(): express.Express {
  const app = express()
  app.use(requestIdMiddleware)
  app.use(express.json())
  app.use('/api/v1', createAccountRouter())
  app.use(errorHandler)
  return app
}

describe('Account Routes', () => {
  let app: express.Express
  let userAId: string
  let userAToken: string
  let userBId: string
  let userBToken: string

  beforeEach(async () => {
    vi.clearAllMocks()
    sessionStore.clear()
    userStore.clear()
    app = buildApp()

    const userA = await userStore.getOrCreateByEmail('account-owner-a@example.com')
    userAId = userA.id
    userAToken = 'test-token-account-owner-a'
    await sessionStore.create(userA.email, userAToken)

    const userB = await userStore.getOrCreateByEmail('account-owner-b@example.com')
    userBId = userB.id
    userBToken = 'test-token-account-owner-b'
    await sessionStore.create(userB.email, userBToken)

    vi.mocked(softDeleteUser).mockResolvedValue({ success: true, userId: userAId })
  })

  describe('DELETE /api/v1/account', () => {
    it('rejects unauthenticated requests', async () => {
      const res = await request(app).delete('/api/v1/account')
      expectErrorShape(res, 'UNAUTHORIZED', 401)
      expect(softDeleteUser).not.toHaveBeenCalled()
    })

    it('rejects requests bearing an invalid/unknown token', async () => {
      const res = await request(app)
        .delete('/api/v1/account')
        .set('Authorization', 'Bearer not-a-real-session-token')

      expect(res.status).toBe(401)
      expect(softDeleteUser).not.toHaveBeenCalled()
    })

    it("deletes only the authenticated caller's own account", async () => {
      await request(app)
        .delete('/api/v1/account')
        .set('Authorization', `Bearer ${userAToken}`)
        .expect(204)

      expect(softDeleteUser).toHaveBeenCalledTimes(1)
      expect(softDeleteUser).toHaveBeenCalledWith(
        userAId,
        userAId,
        expect.any(String),
        expect.anything(),
      )
    })

    it('scopes the delete to the session owner even if another user id is supplied in the body/query (no IDOR)', async () => {
      await request(app)
        .delete('/api/v1/account')
        .set('Authorization', `Bearer ${userAToken}`)
        .query({ userId: userBId })
        .send({ userId: userBId, id: userBId, accountId: userBId })
        .expect(204)

      // Only the caller's own id is ever passed to the delete service — the
      // supplied userB id in the body/query has no effect on which account is targeted.
      expect(softDeleteUser).toHaveBeenCalledWith(
        userAId,
        userAId,
        expect.any(String),
        expect.anything(),
      )
      expect(softDeleteUser).not.toHaveBeenCalledWith(
        userBId,
        expect.anything(),
        expect.anything(),
        expect.anything(),
      )
    })

    it("does not touch another user's account or session", async () => {
      await request(app)
        .delete('/api/v1/account')
        .set('Authorization', `Bearer ${userAToken}`)
        .expect(204)

      expect(softDeleteUser).not.toHaveBeenCalledWith(
        userBId,
        expect.anything(),
        expect.anything(),
        expect.anything(),
      )

      // User B's own session is unaffected by A's deletion.
      const userBSession = await sessionStore.getByToken(userBToken)
      expect(userBSession).toBeDefined()
      expect(userBSession?.email).toBe('account-owner-b@example.com')
    })

    it('returns a consistent error shape when the underlying delete fails', async () => {
      vi.mocked(softDeleteUser).mockResolvedValueOnce({ success: false, error: 'database unavailable' })

      const res = await request(app)
        .delete('/api/v1/account')
        .set('Authorization', `Bearer ${userAToken}`)

      expectErrorShape(res, 'INTERNAL_ERROR', 500)
    })
  })
})
