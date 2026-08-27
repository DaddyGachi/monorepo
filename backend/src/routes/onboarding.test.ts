import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createOnboardingRouter } from './onboarding.js';
import * as db from '../db.js';

vi.mock('../db.js');
vi.mock('../middleware/auth.js', () => ({
  authenticateToken: (req: any, res: any, next: any) => {
    req.user = req.headers['x-user'] ? JSON.parse(req.headers['x-user'] as string) : null;
    next();
  },
}));
vi.mock('../utils/piiEncryption.js', () => ({
  encryptPersonalInfoFields: (data: any) => data,
}));
vi.mock('../jobs/scheduler/store.js', () => ({
  getJobStore: () => ({ create: vi.fn() }),
}));

const app = express();
app.use(express.json());
app.use('/api/onboarding', createOnboardingRouter());
app.use((err: any, req: any, res: any, next: any) => {
  res.status(err.statusCode || 500).json({ error: err.message, code: err.errorCode });
});

describe('onboarding router', () => {
  let mockQuery: any;

  beforeEach(() => {
    vi.resetAllMocks();
    mockQuery = vi.fn();
    vi.mocked(db.getPool).mockResolvedValue({ query: mockQuery } as any);
  });

  describe('GET /api/onboarding/status', () => {
    it('returns empty status if no draft found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get('/api/onboarding/status').set('x-user', JSON.stringify({ id: 'u1' }));
      expect(res.status).toBe(200);
      expect(res.body.currentStep).toBe('personal_info');
      expect(res.body.completedSteps).toEqual([]);
    });

    it('returns draft status', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ completed_steps: ['personal_info'], current_step: 'employment_info' }] });
      const res = await request(app).get('/api/onboarding/status').set('x-user', JSON.stringify({ id: 'u1' }));
      expect(res.status).toBe(200);
      expect(res.body.currentStep).toBe('employment_info');
      expect(res.body.completedSteps).toEqual(['personal_info']);
    });
  });

  describe('POST /api/onboarding/draft', () => {
    it('returns 400 for invalid data', async () => {
      const res = await request(app).post('/api/onboarding/draft').set('x-user', JSON.stringify({ id: 'u1' })).send({
        personalInfo: { bad: 'data' }
      });
      expect(res.status).toBe(400);
    });

    it('upserts draft successfully', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // existing
      mockQuery.mockResolvedValueOnce({ rows: [{ completed_steps: ['personal_info'], current_step: 'employment_info' }] }); // insert

      const res = await request(app).post('/api/onboarding/draft').set('x-user', JSON.stringify({ id: 'u1' })).send({
        personalInfo: { firstName: 'John', lastName: 'Doe', dateOfBirth: '1990-01-01', phone: '123' }
      });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
  
  describe('POST /api/onboarding/submit', () => {
    it('returns 404 if draft not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).post('/api/onboarding/submit').set('x-user', JSON.stringify({ id: 'u1' }));
      expect(res.status).toBe(404);
    });
    
    it('submits successfully', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ personal_info: {}, employment_info: {}, submitted: false }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      
      const res = await request(app).post('/api/onboarding/submit').set('x-user', JSON.stringify({ id: 'u1' }));
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
