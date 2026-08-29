import { describe, it, expect, vi } from 'vitest'
import { OracleSorobanClient } from './oracle.js'
import type { SorobanAdapter, OraclePriceReading } from './adapter.js'

function mockAdapter(overrides: Partial<SorobanAdapter> = {}): SorobanAdapter {
  return {
    ...overrides,
  } as SorobanAdapter
}

describe('OracleSorobanClient', () => {
  describe('getPrice', () => {
    it('maps a fresh adapter reading to a PriceFeed', async () => {
      const reading: OraclePriceReading = { price: 16_000_000_000n, decimals: 7, updatedAt: 1_000, sequence: 3 }
      const getOraclePrice = vi.fn().mockResolvedValue(reading)
      const client = new OracleSorobanClient(mockAdapter({ getOraclePrice }))

      const feed = await client.getPrice('NGN_USDC')

      expect(getOraclePrice).toHaveBeenCalledWith('NGN_USDC')
      expect(feed).toEqual({
        pair: 'NGN_USDC',
        price: '16000000000',
        decimals: 7,
        updatedAt: 1_000,
        sequence: 3,
      })
    })

    it('propagates adapter errors (e.g. the contract reverting PriceTooStale)', async () => {
      const getOraclePrice = vi.fn().mockRejectedValue(new Error('ContractError(4)'))
      const client = new OracleSorobanClient(mockAdapter({ getOraclePrice }))

      await expect(client.getPrice('NGN_USDC')).rejects.toThrow('ContractError(4)')
    })

    it('throws a clear error when the adapter does not support getOraclePrice', async () => {
      const client = new OracleSorobanClient(mockAdapter())

      await expect(client.getPrice('NGN_USDC')).rejects.toThrow('does not support getOraclePrice')
    })
  })

  describe('getPriceUnsafe', () => {
    it('delegates to the same staleness-checked read as getPrice', async () => {
      const reading: OraclePriceReading = { price: 100n, decimals: 7, updatedAt: 1, sequence: 1 }
      const getOraclePrice = vi.fn().mockResolvedValue(reading)
      const client = new OracleSorobanClient(mockAdapter({ getOraclePrice }))

      const feed = await client.getPriceUnsafe('NGN_USDC')

      expect(feed.price).toBe('100')
    })
  })

  describe('isStale', () => {
    it('returns the adapter staleness result', async () => {
      const isOraclePriceStale = vi.fn().mockResolvedValue(true)
      const client = new OracleSorobanClient(mockAdapter({ isOraclePriceStale }))

      await expect(client.isStale('NGN_USDC')).resolves.toBe(true)
      expect(isOraclePriceStale).toHaveBeenCalledWith('NGN_USDC')
    })

    it('throws a clear error when the adapter does not support isOraclePriceStale', async () => {
      const client = new OracleSorobanClient(mockAdapter())

      await expect(client.isStale('NGN_USDC')).rejects.toThrow('does not support isOraclePriceStale')
    })
  })

  describe('write operations (not wired in this PR)', () => {
    it('init throws referencing issue #1488', async () => {
      const client = new OracleSorobanClient(mockAdapter())
      await expect(client.init('a', 'o', 600n, 500n)).rejects.toThrow('#1488')
    })

    it('updatePrice throws referencing issue #1488', async () => {
      const client = new OracleSorobanClient(mockAdapter())
      await expect(client.updatePrice('NGN_USDC', 1n, 1n)).rejects.toThrow('#1488')
    })

    it('setStalenessThreshold throws referencing issue #1488', async () => {
      const client = new OracleSorobanClient(mockAdapter())
      await expect(client.setStalenessThreshold(600n)).rejects.toThrow('#1488')
    })

    it('setMaxDeviationBps throws referencing issue #1488', async () => {
      const client = new OracleSorobanClient(mockAdapter())
      await expect(client.setMaxDeviationBps(500n)).rejects.toThrow('#1488')
    })
  })
})
