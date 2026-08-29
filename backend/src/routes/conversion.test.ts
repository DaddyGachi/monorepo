import express from 'express'
import request from 'supertest'
import { describe, it, expect, vi } from 'vitest'
import { createConversionRouter } from './conversion.js'
import { ConversionRateService } from '../services/conversionRateService.js'
import { OracleConversionProvider } from '../services/conversionProvider.js'
import type { OracleClient, PriceFeed } from '../soroban/oracle.js'

function buildApp(rateService: Partial<ConversionRateService>) {
  const app = express()
  app.use('/api/conversion', createConversionRouter(rateService as ConversionRateService))
  app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } })
  })
  return app
}

describe('GET /api/conversion/rate', () => {
  it('returns rate, source, fetchedAt, expiresAt from the service', async () => {
    const mockRate = {
      rate: 1550.75,
      source: 'stub',
      fetchedAt: '2026-06-30T10:00:00.000Z',
      expiresAt: '2026-06-30T10:05:00.000Z',
    }
    const rateService = { getRate: vi.fn().mockResolvedValue(mockRate) }
    const app = buildApp(rateService)

    const res = await request(app).get('/api/conversion/rate').expect(200)

    expect(res.body.rate).toBe(1550.75)
    expect(res.body.source).toBe('stub')
    expect(res.body.fetchedAt).toBe('2026-06-30T10:00:00.000Z')
    expect(res.body.expiresAt).toBe('2026-06-30T10:05:00.000Z')
  })

  it('calls getRate exactly once per request', async () => {
    const mockRate = { rate: 1500, source: 'stub', fetchedAt: '', expiresAt: '' }
    const rateService = { getRate: vi.fn().mockResolvedValue(mockRate) }
    const app = buildApp(rateService)

    await request(app).get('/api/conversion/rate').expect(200)

    expect(rateService.getRate).toHaveBeenCalledTimes(1)
  })

  it('surfaces provider error as 500 when rate is unavailable', async () => {
    const rateService = {
      getRate: vi.fn().mockRejectedValue(new Error('FX provider unreachable')),
    }
    const app = buildApp(rateService)

    const res = await request(app).get('/api/conversion/rate').expect(500)

    expect(res.body.error.code).toBe('INTERNAL_ERROR')
    expect(res.body.error.message).toContain('FX provider unreachable')
  })

  it('does not silently swallow a stale-rate error', async () => {
    const rateService = {
      getRate: vi.fn().mockRejectedValue(new Error('Rate cache expired and provider timed out')),
    }
    const app = buildApp(rateService)

    const res = await request(app).get('/api/conversion/rate').expect(500)

    expect(res.body.error).toBeDefined()
    expect(res.body.error.message).toMatch(/Rate cache expired/)
  })

  it('response is the exact object returned by the service (faithful pass-through)', async () => {
    const mockRate = {
      rate: 1600,
      source: 'coingecko',
      fetchedAt: '2026-06-30T08:00:00.000Z',
      expiresAt: '2026-06-30T08:05:00.000Z',
    }
    const rateService = { getRate: vi.fn().mockResolvedValue(mockRate) }
    const app = buildApp(rateService)

    const res = await request(app).get('/api/conversion/rate').expect(200)

    expect(res.body).toEqual(mockRate)
  })
})

describe('GET /api/v1/conversion/rate with CONVERSION_PROVIDER=oracle (issue #1488)', () => {
  function mockOracleClient(overrides: Partial<OracleClient> = {}): OracleClient {
    return {
      init: vi.fn(),
      updatePrice: vi.fn(),
      getPrice: vi.fn(),
      getPriceUnsafe: vi.fn(),
      isStale: vi.fn().mockResolvedValue(false),
      setStalenessThreshold: vi.fn(),
      setMaxDeviationBps: vi.fn(),
      ...overrides,
    } as OracleClient
  }

  it('reflects the on-chain oracle price end-to-end through the real ConversionRateService', async () => {
    const feed: PriceFeed = {
      pair: 'NGN_USDC',
      price: '16500000000', // 1650.0000000 scaled by 10^7
      decimals: 7,
      updatedAt: 1_000,
      sequence: 7,
    }
    const oracleClient = mockOracleClient({
      isStale: vi.fn().mockResolvedValue(false),
      getPrice: vi.fn().mockResolvedValue(feed),
    })
    const provider = new OracleConversionProvider(oracleClient)
    const rateService = new ConversionRateService(provider)

    const app = express()
    app.use('/api/v1/conversion', createConversionRouter(rateService))

    const res = await request(app).get('/api/v1/conversion/rate').expect(200)

    expect(res.body.rate).toBe(1650)
    expect(res.body.source).toBe('oracle')
  })

  it('does not serve a stale on-chain price silently', async () => {
    const oracleClient = mockOracleClient({
      isStale: vi.fn().mockResolvedValue(true),
    })
    const provider = new OracleConversionProvider(oracleClient)
    const rateService = new ConversionRateService(provider)

    const app = express()
    app.use('/api/v1/conversion', createConversionRouter(rateService))
    app.use((err: any, _req: any, res: any, _next: any) => {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } })
    })

    const res = await request(app).get('/api/v1/conversion/rate').expect(500)

    expect(res.body.error.message).toMatch(/stale/i)
  })
})
