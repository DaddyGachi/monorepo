import { loadContractAddresses } from '../config/contractAddresses.js'

export type SorobanConfig = {
  rpcUrl: string
  networkPassphrase: string
  contractId?: string
  timelockId?: string
  stakingPoolId?: string
  stakingRewardsId?: string
  usdcTokenId?: string
  dealEscrowId?: string
  inspectorBondId?: string
  rentToOwnId?: string
  oraclePriceFeedsId?: string
  governanceId?: string
  adminSecret?: string
  seed?: string | number
}

export function getSorobanConfigFromEnv(env: NodeJS.ProcessEnv): SorobanConfig {
  const addresses = loadContractAddresses(env)
  return {
    rpcUrl: env.SOROBAN_RPC_URL ?? "https://soroban-testnet.stellar.org",
    networkPassphrase: env.SOROBAN_NETWORK_PASSPHRASE ?? "Test SDF Network ; September 2015",
    contractId: addresses.core,
    timelockId: addresses.timelock,
    stakingPoolId: addresses.stakingPool,
    stakingRewardsId: addresses.stakingRewards,
    usdcTokenId: addresses.usdcToken,
    dealEscrowId: addresses.dealEscrow,
    inspectorBondId: addresses.inspectorBond,
    rentToOwnId: addresses.rentToOwn,
    oraclePriceFeedsId: addresses.oraclePriceFeeds,
    governanceId: addresses.governance,
    adminSecret: env.SOROBAN_ADMIN_SECRET,
    seed: env.SOROBAN_STUB_SEED,
  }
}
