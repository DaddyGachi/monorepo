import type { SorobanAdapter } from './adapter.js'

export interface PriceFeed {
  pair: string
  price: string
  decimals: number
  updatedAt: number
  sequence: number
}

export interface OracleClient {
  init(admin: string, operator: string, stalenessThreshold: bigint, maxDeviationBps: bigint): Promise<string>
  updatePrice(pair: string, price: bigint, sequence: bigint): Promise<string>
  getPrice(pair: string): Promise<PriceFeed>
  getPriceUnsafe(pair: string): Promise<PriceFeed>
  isStale(pair: string): Promise<boolean>
  setStalenessThreshold(threshold: bigint): Promise<string>
  setMaxDeviationBps(maxDeviationBps: bigint): Promise<string>
}

/**
 * Typed wrapper for the oracle_price_feeds Soroban contract.
 *
 * Read path (getPrice/getPriceUnsafe/isStale) is wired to a real, working
 * adapter call added for issue #1488: SorobanAdapter.getOraclePrice /
 * isOraclePriceStale. Unlike the original version of this class, it does not
 * take a `contractId` constructor argument — the target contract comes from
 * the adapter's own SorobanConfig.oraclePriceFeedsId (SOROBAN_ORACLE_PRICE_FEEDS_ID),
 * the same way every other contract-typed adapter method (getBalance,
 * getBond, ...) resolves its contract ID. A second, independently-passed
 * contractId here would just be a second source of truth that could silently
 * disagree with the adapter's config.
 *
 * Write path (init/updatePrice/setStalenessThreshold/setMaxDeviationBps) is
 * intentionally NOT wired in this PR: publishing on-chain prices needs an
 * off-chain price-publishing job pulling from a real market data source,
 * which is out of scope here (see PR description). Calling a write method
 * throws rather than silently no-oping.
 */
export class OracleSorobanClient implements OracleClient {
  constructor(private readonly adapter: SorobanAdapter) {}

  async getPrice(pair: string): Promise<PriceFeed> {
    const reading = await this.requireAdapterMethod('getOraclePrice')(pair)
    return {
      pair,
      price: reading.price.toString(),
      decimals: reading.decimals,
      updatedAt: reading.updatedAt,
      sequence: reading.sequence,
    }
  }

  async getPriceUnsafe(pair: string): Promise<PriceFeed> {
    // The contract's get_price_unsafe (no staleness check) is not exposed on
    // SorobanAdapter because nothing in this codebase needs an unchecked read
    // yet; getPrice's underlying get_price already enforces staleness.
    return this.getPrice(pair)
  }

  async isStale(pair: string): Promise<boolean> {
    return this.requireAdapterMethod('isOraclePriceStale')(pair)
  }

  async init(_admin: string, _operator: string, _stalenessThreshold: bigint, _maxDeviationBps: bigint): Promise<string> {
    throw new Error(
      'OracleSorobanClient.init is not wired to the on-chain oracle in this PR; ' +
        'see issue #1488 (off-chain price-publishing job is a separate follow-up).',
    )
  }

  async updatePrice(_pair: string, _price: bigint, _sequence: bigint): Promise<string> {
    throw new Error(
      'OracleSorobanClient.updatePrice is not wired to the on-chain oracle in this PR; ' +
        'see issue #1488 (off-chain price-publishing job is a separate follow-up).',
    )
  }

  async setStalenessThreshold(_threshold: bigint): Promise<string> {
    throw new Error(
      'OracleSorobanClient.setStalenessThreshold is not wired to the on-chain oracle in this PR; ' +
        'see issue #1488 (off-chain price-publishing job is a separate follow-up).',
    )
  }

  async setMaxDeviationBps(_maxDeviationBps: bigint): Promise<string> {
    throw new Error(
      'OracleSorobanClient.setMaxDeviationBps is not wired to the on-chain oracle in this PR; ' +
        'see issue #1488 (off-chain price-publishing job is a separate follow-up).',
    )
  }

  private requireAdapterMethod<K extends 'getOraclePrice' | 'isOraclePriceStale'>(
    method: K,
  ): NonNullable<SorobanAdapter[K]> {
    const fn = this.adapter[method]
    if (typeof fn !== 'function') {
      throw new Error(`SorobanAdapter does not support ${method}`)
    }
    return fn.bind(this.adapter) as NonNullable<SorobanAdapter[K]>
  }
}
