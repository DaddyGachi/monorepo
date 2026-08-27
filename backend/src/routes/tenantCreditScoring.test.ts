import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createTenantCreditScoringRouter } from './tenantCreditScoring.js';

vi.mock('../middleware/auth.js', () => ({
  authenticateToken: (req: any, res: any, next: any) => {
    req.user = req.headers['x-user'] ? JSON.parse(req.headers['x-user'] as string) : null;
    next();
  },
}));
vi.mock('../middleware/validate.js', () => ({
  validate: () => (req: any, res: any, next: any) => next(),
}));
vi.mock('../services/tenantCreditScoringService.js', () => {
  return {
    TenantCreditScoringService: vi.fn().mockImplementation(() => ({
      calculateScore: vi.fn().mockResolvedValue({ score: 800, band: 'EXCELLENT' }),
      overrideScore: vi.fn().mockResolvedValue({ score: 800 }),
    }))
  };
});
vi.mock('../models/tenantCreditScoreStore.js', () => ({
  tenantCreditScoreStore: {
    findHistoryByTenant: vi.fn().mockResolvedValue([]),
    getConfig: vi.fn().mockResolvedValue({}),
    updateConfig: vi.fn().mockResolvedValue({}),
  }
}));

const app = express();
app.use(express.json());
app.use('/api', createTenantCreditScoringRouter());
app.use((err: any, req: any, res: any, next: any) => {
  res.status(err.statusCode || 500).json({ error: err.message, code: err.errorCode });
});

describe('tenantCreditScoring router', () => {
  describe('POST /api/score', () => {
    it('returns 403 if not admin/compliance', async () => {
      const res = await request(app).post('/api/score').set('x-user', JSON.stringify({ role: 'user' }));
      expect(res.status).toBe(403);
    });
    
    it('calculates score successfully', async () => {
      const res = await request(app).post('/api/score').set('x-user', JSON.stringify({ role: 'admin' })).send({});
      expect(res.status).toBe(200);
      expect(res.body.score).toBe(800);
    });
  });
});
