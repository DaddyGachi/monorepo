import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createLeaseAgreementsRouter } from './leaseAgreements.js';
import { leaseAgreementStore } from '../models/leaseAgreementStore.js';
import { dealStore } from '../models/dealStore.js';
import { generateLeaseDraft, buildLeaseTemplateData } from '../services/leaseDocumentService.js';
import * as eSignatureService from '../services/eSignatureService.js';

vi.mock('../middleware/auth.js', () => ({
  authenticateToken: (req: any, res: any, next: any) => {
    req.user = req.headers['x-user'] ? JSON.parse(req.headers['x-user'] as string) : null;
    next();
  },
}));
vi.mock('../models/leaseAgreementStore.js');
vi.mock('../models/dealStore.js');
vi.mock('../services/leaseDocumentService.js');
vi.mock('../services/eSignatureService.js', () => ({
  createESignatureProvider: vi.fn().mockReturnValue({
    createSignatureRequest: vi.fn().mockResolvedValue({ id: 'sig1', status: 'pending', url: 'http://test' }),
    checkStatus: vi.fn().mockResolvedValue({ status: 'completed' }),
    downloadSignedDocument: vi.fn().mockResolvedValue(Buffer.from('test')),
  }),
  computeDocumentHash: vi.fn().mockReturnValue('testhash'),
}));

const app = express();
app.use(express.json());
app.use('/api', createLeaseAgreementsRouter());
app.use((err: any, req: any, res: any, next: any) => {
  res.status(err.statusCode || 500).json({ error: err.message, code: err.errorCode });
});

describe('leaseAgreements router', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('POST /api/deals/:dealId/lease/generate', () => {
    it('returns 401 if not auth', async () => {
      const res = await request(app).post('/api/deals/d1/lease/generate');
      expect(res.status).toBe(401);
    });

    it('returns 404 if deal not found', async () => {
      vi.mocked(dealStore.findById).mockResolvedValue(null as any);
      const res = await request(app).post('/api/deals/d1/lease/generate').set('x-user', JSON.stringify({ id: 'u1' }));
      expect(res.status).toBe(404);
    });
    
    it('returns 200 and generates lease', async () => {
      vi.mocked(dealStore.findById).mockResolvedValue({ id: 'd1' } as any);
      vi.mocked(buildLeaseTemplateData).mockResolvedValue({} as any);
      vi.mocked(generateLeaseDraft).mockResolvedValue(Buffer.from('pdf'));
      vi.mocked(leaseAgreementStore.create).mockResolvedValue({ id: 'l1', dealId: 'd1' } as any);
      
      const res = await request(app).post('/api/deals/d1/lease/generate').set('x-user', JSON.stringify({ id: 'u1' }));
      expect(res.status).toBe(200);
      expect(res.body.agreement.id).toBe('l1');
    });
  });
});
