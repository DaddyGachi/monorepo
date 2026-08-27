import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createCreditScoreRouter, createAdminCreditScoreRouter } from './creditScore.js';
import { creditScoreService } from '../services/creditScoreService.js';

vi.mock('../middleware/auth.js', () => ({
  authenticateToken: (req: any, res: any, next: any) => {
    req.user = req.headers['x-user'] ? JSON.parse(req.headers['x-user'] as string) : null;
    next();
  },
}));

vi.mock('../services/creditScoreService.js');

const app = express();
app.use(express.json());
app.use('/api/scores', createCreditScoreRouter());
app.use('/api/admin/scores', createAdminCreditScoreRouter());
app.use((err: any, req: any, res: any, next: any) => {
  res.status(err.statusCode || 500).json({ error: err.message, code: err.errorCode });
});

describe('creditScore router', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('GET /api/scores/my', () => {
    it('returns 401 if not auth', async () => {
      const res = await request(app).get('/api/scores/my');
      expect(res.status).toBe(401);
    });

    it('returns 404 if no score', async () => {
      vi.mocked(creditScoreService.getLatestSnapshot).mockResolvedValue(null as any);
      const res = await request(app).get('/api/scores/my').set('x-user', JSON.stringify({ id: 'u1' }));
      expect(res.status).toBe(404);
    });

    it('returns score with tips', async () => {
      const snap = { score: 700, band: 'GOOD', factors: [], computedAt: new Date() };
      vi.mocked(creditScoreService.getLatestSnapshot).mockResolvedValue(snap as any);
      vi.mocked(creditScoreService.generateImprovementTips).mockReturnValue(['Pay on time']);
      const res = await request(app).get('/api/scores/my').set('x-user', JSON.stringify({ id: 'u1' }));
      expect(res.status).toBe(200);
      expect(res.body.score).toBe(700);
      expect(res.body.tips).toEqual(['Pay on time']);
    });
  });

  describe('GET /api/admin/scores/:tenantId', () => {
    it('returns 403 if not admin', async () => {
      const res = await request(app).get('/api/admin/scores/t1').set('x-user', JSON.stringify({ id: 'u1', role: 'user' }));
      expect(res.status).toBe(403);
    });

    it('returns score for admin', async () => {
      const snap = { userId: 't1', score: 700, band: 'GOOD', factors: [], computedAt: new Date() };
      vi.mocked(creditScoreService.getLatestSnapshot).mockResolvedValue(snap as any);
      vi.mocked(creditScoreService.generateImprovementTips).mockReturnValue([]);
      const res = await request(app).get('/api/admin/scores/t1').set('x-user', JSON.stringify({ id: 'a1', role: 'admin' }));
      expect(res.status).toBe(200);
      expect(res.body.score).toBe(700);
      expect(res.body.tenantId).toBe('t1');
    });
  });
});
