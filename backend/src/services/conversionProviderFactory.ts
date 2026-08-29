import type { Env } from '../schemas/env.js'
import type { SorobanAdapter } from '../soroban/adapter.js'
import { OracleSorobanClient } from '../soroban/oracle.js'
import { logger } from '../utils/logger.js'
import {
  DEFAULT_ORACLE_PAIR,
  FallbackConversionProvider,
  HttpConversionProvider,
  OracleConversionProvider,
  StubConversionProvider,
  type ConversionProvider,
} from './conversionProvider.js'

export type ConversionProviderDeps = {
  /** Required when CONVERSION_PROVIDER=oracle; the Soroban adapter used to read oracle_price_feeds. */
  sorobanAdapter?: SorobanAdapter
  /** Required when CONVERSION_PROVIDER=oracle; SOROBAN_ORACLE_PRICE_FEEDS_ID contract address. */
  oracleContractId?: string
  /** Defaults to 'NGN_USDC' (Soroban Symbol values cannot contain '/'). */
  oraclePair?: string
}

/**
 * Builds the NGN→USDC conversion provider from environment.
 * - `stub`: deterministic local/test (FX_RATE_NGN_PER_USDC only).
 * - `http`: live JSON rate endpoint (CONVERSION_RATE_URL required).
 * - `fallback`: try HTTP when URL is set; on any failure use stub (deterministic); if URL unset, stub only.
 * - `oracle`: read the on-chain oracle_price_feeds contract; on any failure (stale, no quorum,
 *   unconfigured contract, RPC error) fall back to stub, same resilience shape as `fallback`.
 */
export function createConversionProviderFromEnv(e: Env, deps: ConversionProviderDeps = {}): ConversionProvider {
  const stub = new StubConversionProvider(e.FX_RATE_NGN_PER_USDC)

  if (e.CONVERSION_PROVIDER === 'stub') {
    return stub
  }

  if (e.CONVERSION_PROVIDER === 'http') {
    return new HttpConversionProvider({
      rateUrl: e.CONVERSION_RATE_URL!,
      apiKey: e.CONVERSION_RATE_API_KEY,
      timeoutMs: e.CONVERSION_HTTP_TIMEOUT_MS,
      minRate: e.CONVERSION_RATE_MIN,
      maxRate: e.CONVERSION_RATE_MAX,
    })
  }

  if (e.CONVERSION_PROVIDER === 'oracle') {
    if (!deps.sorobanAdapter || !deps.oracleContractId) {
      logger.info(
        'CONVERSION_PROVIDER=oracle without SOROBAN_ORACLE_PRICE_FEEDS_ID (or no Soroban adapter passed in); using stub-only conversion',
      )
      return stub
    }
    const oracleClient = new OracleSorobanClient(deps.sorobanAdapter)
    const oracle = new OracleConversionProvider(oracleClient, deps.oraclePair ?? DEFAULT_ORACLE_PAIR)
    return new FallbackConversionProvider(oracle, stub)
  }

  // fallback
  if (!e.CONVERSION_RATE_URL) {
    logger.info('CONVERSION_PROVIDER=fallback without CONVERSION_RATE_URL; using stub-only conversion')
    return stub
  }

  const http = new HttpConversionProvider({
    rateUrl: e.CONVERSION_RATE_URL,
    apiKey: e.CONVERSION_RATE_API_KEY,
    timeoutMs: e.CONVERSION_HTTP_TIMEOUT_MS,
    minRate: e.CONVERSION_RATE_MIN,
    maxRate: e.CONVERSION_RATE_MAX,
  })

  return new FallbackConversionProvider(http, stub)
}
