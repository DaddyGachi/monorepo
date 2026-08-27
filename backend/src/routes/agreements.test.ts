import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import agreementsRouter from './agreements.js';
import { agreementService } from '../services/agreementService.js';
import { rentalAgreementStore } from '../models/rentalAgreementStore.js';

vi.mock('../services/agreementService.js');
vi.mock('../models/rentalAgreementStore.js');

const app = express();
app.use(express.json());
app.use('/api/agreements', agreementsRouter);
app.use((err: any, req: any, res: any, next: any) => {
  res.status(err.statusCode || 500).json({ error: err.message, code: err.errorCode });
});

describe('agreements router', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('POST /api/agreements/generate', () => {
    it('returns 400 if dealId is missing', async () => {
      const res = await request(app).post('/api/agreements/generate').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('dealId is required');
    });

    it('generates agreement successfully', async () => {
      vi.mocked(agreementService.generateAgreement).mockResolvedValue({ id: 'agr1' } as any);
      const res = await request(app).post('/api/agreements/generate').send({ dealId: 'deal1' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.agreement.id).toBe('agr1');
    });
  });

  describe('GET /api/agreements/:id', () => {
    it('returns 404 if not found', async () => {
      vi.mocked(rentalAgreementStore.findById).mockResolvedValue(null as any);
      const res = await request(app).get('/api/agreements/foo');
      expect(res.status).toBe(404);
    });

    it('returns agreement successfully', async () => {
      vi.mocked(rentalAgreementStore.findById).mockResolvedValue({ id: 'foo' } as any);
      const res = await request(app).get('/api/agreements/foo');
      expect(res.status).toBe(200);
      expect(res.body.agreement.id).toBe('foo');
    });
  });
  
  describe('POST /api/agreements/:id/sign', () => {
    it('returns 400 if token missing', async () => {
      const res = await request(app).post('/api/agreements/foo/sign').send({ signatureData: {} });
      expect(res.status).toBe(400);
    });
    
    it('signs successfully', async () => {
      vi.mocked(agreementService.recordSignature).mockResolvedValue({ id: 'foo', status: 'signed' } as any);
      const res = await request(app).post('/api/agreements/foo/sign').send({ token: 'abc', signatureData: { x: 1 } });
      expect(res.status).toBe(200);
      expect(res.body.agreement.status).toBe('signed');
    });
  });
});
