import { describe, it, expect, beforeEach, vi } from 'vitest';
import { apiFetch, apiPost, ApiError } from '../api';
import { apiRateLimiters } from '../rate-limiter';

describe('apiFetch client-side rate limiting', () => {
  beforeEach(() => {
    // Reset rate limiters
    apiRateLimiters.general.reset();
    apiRateLimiters.auth.reset();
    apiRateLimiters.sensitive.reset();
    apiRateLimiters.upload.reset();
    vi.restoreAllMocks();
  });

  it('allows normal requests within rate limit', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const result = await apiFetch<{ success: boolean }>('/properties');
    expect(result.success).toBe(true);
  });

  it('demonstrably blocks rapid duplicate/exceeded requests on sensitive endpoints', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const endpoint = '/staking/claim';

    // Sensitive limit is 3 requests per hour
    await apiPost(endpoint, { amount: 100 });
    await apiPost(endpoint, { amount: 100 });
    await apiPost(endpoint, { amount: 100 });

    // 4th request exceeds the rate limit and should throw 429 ApiError
    await expect(apiPost(endpoint, { amount: 100 })).rejects.toThrow(ApiError);

    try {
      await apiPost(endpoint, { amount: 100 });
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(429);
      expect(apiErr.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(apiErr.message).toContain('Rate limit exceeded');
    }
  });

  it('enforces auth endpoint limit on repeated auth attempts', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify({ token: 'test' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const authPath = '/auth/login';

    // Auth limit is 5 requests
    for (let i = 0; i < 5; i++) {
      await apiPost(authPath, { username: 'test', password: 'password' });
    }

    // 6th attempt should be blocked
    await expect(
      apiPost(authPath, { username: 'test', password: 'password' })
    ).rejects.toThrow(ApiError);
  });
});
