import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createTenantOnboardingRouter } from './tenantOnboarding.js';

vi.mock('../middleware/auth.js', () => ({
  authenticateToken: (req: any, res: any, next: any) => {
    req.user = req.headers['x-user'] ? JSON.parse(req.headers['x-user'] as string) : null;
    next();
  },
}));
vi.mock('../middleware/validate.js', () => ({
  validate: () => (req: any, res: any, next: any) => next(),
}));
vi.mock('../models/tenantOnboardingDataStore.js', () => ({
  tenantOnboardingDataStore: { upsert: vi.fn().mockResolvedValue({}) }
}));
vi.mock('../models/tenantApplicationStore.js', () => ({
  tenantApplicationStore: { updateStatus: vi.fn().mockResolvedValue({}) }
}));
vi.mock('../services/tenantCreditScoringService.js', () => ({
  tenantCreditScoringService: { evaluateApplication: vi.fn().mockResolvedValue({ score: 700 }) }
}));
vi.mock('../services/underwritingService.js', () => ({
  underwritingService: { runFullAssessment: vi.fn().mockResolvedValue({ approved: true }) }
}));

const app = express();
app.use(express.json());
app.use('/api/tenant-onboarding', createTenantOnboardingRouter());
app.use((err: any, req: any, res: any, next: any) => {
  res.status(err.statusCode || 500).json({ error: err.message, code: err.errorCode });
});

describe('tenantOnboarding router', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('POST /api/tenant-onboarding/submit', () => {
    it('returns 401 if not auth', async () => {
      const res = await request(app).post('/api/tenant-onboarding/submit');
      expect(res.status).toBe(401);
    });

    it('submits successfully', async () => {
      const res = await request(app).post('/api/tenant-onboarding/submit').set('x-user', JSON.stringify({ id: 'u1' })).send({
        applicationId: 'a1',
      });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
