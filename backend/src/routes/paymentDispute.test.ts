import { describe, it, expect, beforeEach, vi } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'
import { sessionStore, userStore } from '../models/authStore.js'
import { paymentDisputeRepository } from '../repositories/PaymentDisputeRepository.js'
import { expectErrorShape } from '../test-helpers.js'

describe('Payment Dispute API', () => {
  let app: any
  let authToken: string
  let adminToken: string
  let userId: string
  let adminId: string

  beforeEach(async () => {
    sessionStore.clear()
    userStore.clear()
    app = createApp()

    // Create a regular user
    const user = await userStore.getOrCreateByEmail('user@example.com')
    userId = user.id
    const userSession = await sessionStore.create('user@example.com', 'user-session-token')
    authToken = userSession.token

    // Create an admin user
    const admin = await userStore.getOrCreateByEmail('admin@example.com')
    adminId = admin.id
    const adminSession = await sessionStore.create('admin@example.com', 'admin-session-token')
    adminToken = adminSession.token
  })

  describe('POST /api/tenant/payments/disputes', () => {
    it('should reject unauthenticated request', async () => {
      const response = await request(app)
        .post('/api/tenant/payments/disputes')
        .send({
          paymentId: '550e8400-e29b-41d4-a716-446655440000',
          reason: 'amount_discrepancy',
          description: 'Test description',
        })
        .expect(401)

      expectErrorShape(response, 'UNAUTHORIZED', 401)
    })

    it('should reject invalid paymentId format', async () => {
      const response = await request(app)
        .post('/api/tenant/payments/disputes')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          paymentId: 'not-a-uuid',
          reason: 'amount_discrepancy',
          description: 'Test description',
        })
        .expect(400)

      expectErrorShape(response, 'VALIDATION_ERROR', 400)
    })

    it('should reject invalid reason', async () => {
      const response = await request(app)
        .post('/api/tenant/payments/disputes')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          paymentId: '550e8400-e29b-41d4-a716-446655440000',
          reason: 'invalid_reason',
          description: 'Test description',
        })
        .expect(400)

      expectErrorShape(response, 'VALIDATION_ERROR', 400)
    })

    it('should reject description that is too short', async () => {
      const response = await request(app)
        .post('/api/tenant/payments/disputes')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          paymentId: '550e8400-e29b-41d4-a716-446655440000',
          reason: 'amount_discrepancy',
          description: 'short',
        })
        .expect(400)

      expectErrorShape(response, 'VALIDATION_ERROR', 400)
    })

    it('should reject description that is too long', async () => {
      const response = await request(app)
        .post('/api/tenant/payments/disputes')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          paymentId: '550e8400-e29b-41d4-a716-446655440000',
          reason: 'amount_discrepancy',
          description: 'a'.repeat(1001),
        })
        .expect(400)

      expectErrorShape(response, 'VALIDATION_ERROR', 400)
    })

    it('should reject evidenceKeys array with too many items', async () => {
      const response = await request(app)
        .post('/api/tenant/payments/disputes')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          paymentId: '550e8400-e29b-41d4-a716-446655440000',
          reason: 'amount_discrepancy',
          description: 'Test description with sufficient length',
          evidenceKeys: ['1', '2', '3', '4', '5', '6'],
        })
        .expect(400)

      expectErrorShape(response, 'VALIDATION_ERROR', 400)
    })

    it('should reject missing required fields', async () => {
      const response = await request(app)
        .post('/api/tenant/payments/disputes')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          paymentId: '550e8400-e29b-41d4-a716-446655440000',
          // Missing reason and description
        })
        .expect(400)

      expectErrorShape(response, 'VALIDATION_ERROR', 400)
    })

    it('should return 500 when database is not available', async () => {
      const disputeData = {
        paymentId: '550e8400-e29b-41d4-a716-446655440000',
        dealId: 'deal-1',
        reason: 'amount_discrepancy',
        description: 'The amount charged is incorrect',
      }

      const response = await request(app)
        .post('/api/tenant/payments/disputes')
        .set('Authorization', `Bearer ${authToken}`)
        .send(disputeData)
        .expect(500)

      expectErrorShape(response, 'INTERNAL_ERROR', 500)
    })
  })

  describe('GET /api/tenant/payments/disputes', () => {
    it('should reject unauthenticated request', async () => {
      const response = await request(app)
        .get('/api/tenant/payments/disputes')
        .expect(401)

      expectErrorShape(response, 'UNAUTHORIZED', 401)
    })

    it('should return 500 when database is not available', async () => {
      const response = await request(app)
        .get('/api/tenant/payments/disputes')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(500)

      expectErrorShape(response, 'INTERNAL_ERROR', 500)
    })
  })
})
