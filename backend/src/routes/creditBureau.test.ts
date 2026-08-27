import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import creditBureauRouter from './creditBureau.js';
import { creditBureauService } from '../services/creditBureauService.js';
import { auditLog } from '../utils/auditLogger.js';

vi.mock('../services/creditBureauService.js');
vi.mock('../utils/auditLogger.js');

const app = express();
app.use(express.json());
app.use('/api', creditBureauRouter);
app.use((err: any, req: any, res: any, next: any) => {
  res.status(err.statusCode || 500).json({ error: err.message, code: err.errorCode });
});

describe('creditBureau router', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('POST /api/admin/tenants/:tenantId/pull-credit-report', () => {
    it('returns 400 for missing bvn or nin', async () => {
      const res = await request(app).post('/api/admin/tenants/t1/pull-credit-report').send({});
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid bvn', async () => {
      const res = await request(app).post('/api/admin/tenants/t1/pull-credit-report').send({ bvn: '123', nin: '12345678901' });
      expect(res.status).toBe(400);
    });

    it('pulls report successfully', async () => {
      vi.mocked(creditBureauService.pullReport).mockResolvedValue({ score: 750 } as any);
      const res = await request(app).post('/api/admin/tenants/t1/pull-credit-report').send({ bvn: '12345678901', nin: '12345678901' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.report.score).toBe(750);
      expect(auditLog).toHaveBeenCalled();
    });
  });

  describe('GET /api/admin/tenants/:tenantId/credit-report', () => {
    it('returns 404 if no report', async () => {
      vi.mocked(creditBureauService.getCachedReport).mockResolvedValue(null as any);
      const res = await request(app).get('/api/admin/tenants/t1/credit-report');
      expect(res.status).toBe(404);
    });

    it('returns report', async () => {
      vi.mocked(creditBureauService.getCachedReport).mockResolvedValue({ score: 750 } as any);
      const res = await request(app).get('/api/admin/tenants/t1/credit-report');
      expect(res.status).toBe(200);
      expect(res.body.report.score).toBe(750);
    });
  });
});
