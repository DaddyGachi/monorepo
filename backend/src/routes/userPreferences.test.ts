import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'
import { sessionStore, userStore } from '../models/authStore.js'
import { expectErrorShape } from '../test-helpers.js'

describe('User Preferences API', () => {
  let app: any
  let authToken: string

  beforeEach(async () => {
    sessionStore.clear()
    userStore.clear()
    app = createApp()

    // Create a test user and session
    const user = await userStore.getOrCreateByEmail('test@example.com')
    const session = await sessionStore.create('test@example.com', 'test-session-token')
    authToken = session.token
  })

  describe('PATCH /api/user/preferences', () => {
    it('should update display currency to NGN', async () => {
      const response = await request(app)
        .patch('/api/user/preferences')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ displayCurrency: 'NGN' })
        .expect(200)

      expect(response.body).toHaveProperty('displayCurrency', 'NGN')
      expect(response.body).toHaveProperty('user')
      expect(response.body.user).toHaveProperty('id')
      expect(response.body.user).toHaveProperty('email')
      expect(response.body.user).toHaveProperty('displayCurrency', 'NGN')
    })

    it('should update display currency to USDC', async () => {
      const response = await request(app)
        .patch('/api/user/preferences')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ displayCurrency: 'USDC' })
        .expect(200)

      expect(response.body.displayCurrency).toBe('USDC')
      expect(response.body.user.displayCurrency).toBe('USDC')
    })

    it('should reject unauthenticated request', async () => {
      const response = await request(app)
        .patch('/api/user/preferences')
        .send({ displayCurrency: 'NGN' })
        .expect(401)

      expectErrorShape(response, 'UNAUTHORIZED', 401)
    })

    it('should reject invalid display currency value', async () => {
      const response = await request(app)
        .patch('/api/user/preferences')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ displayCurrency: 'INVALID' })
        .expect(400)

      expectErrorShape(response, 'VALIDATION_ERROR', 400)
    })

    it('should reject missing display currency field', async () => {
      const response = await request(app)
        .patch('/api/user/preferences')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(400)

      expectErrorShape(response, 'VALIDATION_ERROR', 400)
    })

    it('should reject wrong type for display currency', async () => {
      const response = await request(app)
        .patch('/api/user/preferences')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ displayCurrency: 123 })
        .expect(400)

      expectErrorShape(response, 'VALIDATION_ERROR', 400)
    })

    it('should return user object with correct shape', async () => {
      const response = await request(app)
        .patch('/api/user/preferences')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ displayCurrency: 'NGN' })
        .expect(200)

      const user = response.body.user
      expect(user).toHaveProperty('id')
      expect(user).toHaveProperty('email')
      expect(user).toHaveProperty('name')
      expect(user).toHaveProperty('role')
      expect(user).toHaveProperty('displayCurrency')
      expect(typeof user.id).toBe('string')
      expect(typeof user.email).toBe('string')
      expect(typeof user.name).toBe('string')
      expect(typeof user.role).toBe('string')
    })

    it('should not allow updating another users preferences', async () => {
      // Create another user
      const otherUser = await userStore.getOrCreateByEmail('other@example.com')
      const otherSession = await sessionStore.create('other@example.com', 'other-session-token')

      // Try to update preferences using the first user's token
      const response = await request(app)
        .patch('/api/user/preferences')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ displayCurrency: 'USDC' })
        .expect(200)

      // Verify the first user's preferences were updated
      const user = await userStore.getByEmail('test@example.com')
      expect(user?.displayCurrency).toBe('USDC')

      // Verify the other user's preferences were NOT affected
      const otherUserAfter = await userStore.getByEmail('other@example.com')
      expect(otherUserAfter?.displayCurrency).toBe('NGN') // Default value
    })

    it('should handle expired token', async () => {
      // Create an expired session
      const expiredToken = 'expired-token'
      await sessionStore.create('test@example.com', expiredToken)
      
      // Manually expire the session by setting expiresAt in the past
      const session = await sessionStore.getByToken(expiredToken)
      if (session) {
        (session as any).expiresAt = new Date(Date.now() - 1000)
      }

      const response = await request(app)
        .patch('/api/user/preferences')
        .set('Authorization', `Bearer ${expiredToken}`)
        .send({ displayCurrency: 'NGN' })
        .expect(401)

      expectErrorShape(response, 'TOKEN_EXPIRED', 401)
    })

    it('should handle invalid token', async () => {
      const response = await request(app)
        .patch('/api/user/preferences')
        .set('Authorization', 'Bearer invalid-token')
        .send({ displayCurrency: 'NGN' })
        .expect(401)

      expectErrorShape(response, 'INVALID_TOKEN', 401)
    })
  })
})
