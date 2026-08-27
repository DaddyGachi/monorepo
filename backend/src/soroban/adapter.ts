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
 * deal_escrow's rent-release dispute mechanism (request_rent_release /
 * challenge_rent_release / resolve_rent_dispute / settle_*_timeout).
 * `dealId` here is deal_escrow's own String-typed deal ID (unlike
 * rent_to_own, deal_escrow does not use BytesN<32>).
 */
export interface RequestRentReleaseParams {
  dealId: string
  to: string // Stellar Address of the release recipient (e.g. landlord)
  amountUsdc: string // decimal string, USDC (6 decimals)
  externalRefSource: string
  externalRef: string
}

export interface ChallengeRentReleaseParams {
  dealId: string
  challengeEvidenceRef: string
}

/** Mirrors the contract's `SettlementOutcome` enum discriminants (1/2). */
export type RentDisputeOutcome = 'release_to_recipient' | 'refund_to_depositor'

export interface ResolveRentDisputeParams {
  dealId: string
  outcome: RentDisputeOutcome
  resolutionEvidenceRef: string
}

export interface SettleRentReleaseTimeoutParams {
  dealId: string
}

export interface SettleDisputeTimeoutParams {
  dealId: string
}

/**
 * Params for rent_to_own's `register_deal`. `contractDealId` is a hex-encoded
 * BytesN<32> — distinct from deal_escrow's String-typed deal ID (see
 * `SyncDealStatusParams.contractDealId`); rent_to_own and deal_escrow do not
 * share a deal-ID encoding.
 */
export interface RegisterRentToOwnDealParams {
  dealId: string
  contractDealId: string // hex-encoded BytesN<32>
  tenantAddress: string // Stellar Address of the tenant
  propertyValueUsdc: string // decimal string, USDC (6 decimals)
  monthlyEquityUsdc: string // decimal string, USDC (6 decimals)
  totalPaymentsRequired: number
}

export interface RecordRentToOwnEquityPaymentParams {
  dealId: string
  contractDealId: string // hex-encoded BytesN<32>
  period: number
  rentAmountUsdc: string // decimal string, USDC (6 decimals)
  equityAmountUsdc: string // decimal string, USDC (6 decimals)
}

export interface RentToOwnDealActionParams {
  dealId: string
  contractDealId: string // hex-encoded BytesN<32>
  /** Only used by defaultRentToOwnDeal; a short symbol-safe reason code. */
  reason?: string
}

/**
 * A read from the `oracle_price_feeds` contract's `PriceFeed` struct.
 * `price` is scaled by `10^decimals` (decimals is always 7 in the contract).
 */
export interface OraclePriceReading {
  price: bigint
  decimals: number
  updatedAt: number
  sequence: number
}

/**
 * Mirrors `ProposalStatus` in contracts/governance/src/lib.rs.
 */
export type GovernanceProposalStatus =
  | 'Active'
  | 'Passed'
  | 'Rejected'
  | 'Executed'
  | 'Cancelled'

/**
 * Mirrors the `Proposal` struct in contracts/governance/src/lib.rs.
 *
 * All i128 fields are carried as decimal *strings* rather than numbers so that
 * values larger than Number.MAX_SAFE_INTEGER survive the trip through JSON
 * without silent precision loss.
 *
 * `paramKey` is an arbitrary Soroban `Symbol` chosen by the proposer — the
 * contract neither validates nor enumerates it, so it is opaque to the backend
 * too (see the PR description's contract findings).
 */
export interface GovernanceProposal {
  id: number
  proposer: string
  paramKey: string
  currentValue: string
  proposedValue: string
  votesFor: string
  votesAgainst: string
  status: GovernanceProposalStatus
  createdAt: number
  votingEndsAt: number
  snapshottedTotalStaked: string
}

export interface CreateGovernanceProposalParams {
  /** Stellar address of the proposer; also the transaction's source account. */
  proposer: string
  paramKey: string
  currentValue: bigint
  proposedValue: bigint
}

export interface GovernanceVoteParams {
  /** Stellar address of the voter; also the transaction's source account. */
  voter: string
  proposalId: number
  support: boolean
}

/** An unsigned transaction envelope awaiting a signature from the end user's wallet. */
export interface UnsignedTransaction {
  xdr: string
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

  // deal_escrow rent-release dispute mechanism
  requestRentRelease?(params: RequestRentReleaseParams): Promise<void>
  challengeRentRelease?(params: ChallengeRentReleaseParams): Promise<void>
  resolveRentDispute?(params: ResolveRentDisputeParams): Promise<void>
  settleRentReleaseTimeout?(params: SettleRentReleaseTimeoutParams): Promise<void>
  settleDisputeTimeout?(params: SettleDisputeTimeoutParams): Promise<void>

  // rent_to_own contract — equity-tracking deal lifecycle
  registerRentToOwnDeal?(params: RegisterRentToOwnDealParams): Promise<void>
  recordRentToOwnEquityPayment?(params: RecordRentToOwnEquityPaymentParams): Promise<void>
  completeRentToOwnDeal?(params: RentToOwnDealActionParams): Promise<void>
  defaultRentToOwnDeal?(params: RentToOwnDealActionParams): Promise<void>

  // oracle_price_feeds contract — read-only price queries (issue #1488)
  getOraclePrice?(pair: string): Promise<OraclePriceReading>
  isOraclePriceStale?(pair: string): Promise<boolean>

  // ── governance contract — stake-weighted parameter voting (issue #1494) ────
  //
  // `create_proposal` and `vote` call `require_auth()` on the proposer/voter,
  // so they cannot be signed with SOROBAN_ADMIN_SECRET on a user's behalf.
  // These two methods therefore return an *unsigned* envelope for the user's
  // own wallet to sign, which is then broadcast via submitGovernanceTransaction.
  createProposal?(params: CreateGovernanceProposalParams): Promise<UnsignedTransaction>
  vote?(params: GovernanceVoteParams): Promise<UnsignedTransaction>
  /**
   * Broadcast a transaction envelope that was signed client-side (by the
   * connected wallet) and wait for confirmation. Needed to complete the
   * user-signed half of the flow above; it authorizes nothing itself.
   */
  submitGovernanceTransaction?(signedXdr: string): Promise<{ txHash: string }>
  /**
   * `finalize_proposal` and `execute_proposal` take no Address argument and
   * call no `require_auth()` on-chain — they are permissionless once their
   * time conditions are met. The admin key here only pays the fee and submits.
   */
  finalizeProposal?(proposalId: number): Promise<string>
  executeProposal?(proposalId: number): Promise<string>
  getProposal?(proposalId: number): Promise<GovernanceProposal | null>
  getProposalCount?(): Promise<number>
}
