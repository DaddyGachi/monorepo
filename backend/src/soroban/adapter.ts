import { SorobanConfig } from './client.js'
import { TxType } from '../outbox/types.js'
import { RawReceiptEvent } from '../indexer/event-parser.js'

export interface RecordReceiptParams {
  txId: string           // BytesN<32> as hex string - deterministic idempotency key (SHA-256 of canonical external ref)
  txType: TxType
  amountUsdc: string     // USDC amount (canonical); decimal string
  tokenAddress: string   // USDC token contract address
  dealId: string
  listingId?: string
  from?: string
  to?: string
  amountNgn?: number
  fxRate?: number
  fxProvider?: string
  metadataHash?: string
}

export type DealSyncStatus = 'active' | 'completed' | 'defaulted'

export interface SyncDealStatusParams {
  dealId: string
  contractDealId: string
  newStatus: DealSyncStatus
  actor: string
}

/**
 * Callback fired after a Stellar transaction is signed and hashed but *before*
 * it is broadcast to the network. Persisting the hash at this point allows a
 * worker that crashes between broadcast and result-recording to recover by
 * querying the chain for the known hash rather than blindly resubmitting.
 */
export interface TxBroadcastHooks {
  /** Called with the signed tx hash just before sendTransaction. */
  onTxBuilt?: (txHash: string) => Promise<void>
}

/** On-chain status of a previously submitted Stellar transaction. */
export interface TxOnChainStatus {
  status: 'success' | 'failed' | 'not_found' | 'pending'
  /** Ledger sequence in which the tx was applied (only set for 'success'). */
  ledger?: number
}

/**
 * On-chain representation of a tenant's aggregated reputation.
 * Scores are on a 0–1000 scale (off-chain 1–5 avg × 200).
 */
export interface TenantReputationRecord {
  compositeScore: number
  paymentScore: number
  propertyCareScore: number
  communicationScore: number
  totalRatings: number
  lastUpdated: bigint
}

export interface SorobanAdapter {
  getBalance(account: string): Promise<bigint>
  credit(account: string, amount: bigint): Promise<void>
  debit(account: string, amount: bigint): Promise<void>
  getStakedBalance(account: string): Promise<bigint>
  getClaimableRewards(account: string): Promise<bigint>
  recordReceipt(params: RecordReceiptParams, hooks?: TxBroadcastHooks): Promise<void>
  getConfig(): SorobanConfig
  getReceiptEvents(fromLedger: number | null): Promise<RawReceiptEvent[]>
  getTimelockEvents(fromLedger: number | null): Promise<any[]>
  executeTimelock(txHash: string, target: string, functionName: string, args: any[], eta: number): Promise<string>
  cancelTimelock(txHash: string): Promise<string>

  // Inspector bond operations (inspector_bond contract)
  stakeBond(inspectorId: string, amount: bigint): Promise<void>
  unstakeBond(inspectorId: string): Promise<void>
  isBonded(inspectorId: string): Promise<boolean>
  getBond(inspectorId: string): Promise<{ isBonded: boolean; amount: bigint }>

  /**
   * Query the current on-chain status of a previously submitted transaction.
   * Used for crash recovery: if a worker persisted a txHash but crashed before
   * recording the result, the next worker queries this instead of resubmitting.
   *
   * Optional: adapters that do not support status queries (e.g. simple stubs)
   * may omit this method; the sender will fall back to blind resubmission.
   */
  getTransactionStatus?(txHash: string): Promise<TxOnChainStatus>

  // Tenant reputation contract (tenant_reputation)
  updateTenantReputation?(tenantId: string, record: TenantReputationRecord): Promise<void>
  getTenantReputation?(tenantId: string): Promise<TenantReputationRecord | null>

  // Admin operations (require SOROBAN_ADMIN_SIGNING_ENABLED=true)
  pause?(contractId: string): Promise<string>
  unpause?(contractId: string): Promise<string>
  setOperator?(contractId: string, operatorAddress: string | null): Promise<string>
  init?(contractId: string, adminAddress: string, operatorAddress?: string): Promise<string>
  syncDealStatus?(params: SyncDealStatusParams): Promise<void>

  // Contract access role management (contract_access contract)
  proposeAssignRole?(subject: string, role: number): Promise<string>
  confirmAssignRole?(subject: string): Promise<string>
  delegatePermission?(delegatee: string, permission: number): Promise<string>
  getRole?(address: string): Promise<number | null>
  hasPermission?(address: string, permission: number): Promise<boolean>
  listRoles?(): Promise<Array<{ address: string; role: number }>>

  // Upgradeable proxy governance (upgradeable_proxy contract)
  proposeUpgrade?(newWasmHash: string): Promise<string>
  confirmUpgrade?(newWasmHash: string): Promise<string>
  cancelUpgrade?(): Promise<string>
  transferAdmin?(newAdminAddress: string): Promise<string>
  hasPendingUpgrade?(): Promise<boolean>
}
