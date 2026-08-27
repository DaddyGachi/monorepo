import {
     SorobanAdapter,
     RecordReceiptParams,
     SyncDealStatusParams,
     TenantReputationRecord,
     RequestRentReleaseParams,
     ChallengeRentReleaseParams,
     ResolveRentDisputeParams,
     SettleRentReleaseTimeoutParams,
     SettleDisputeTimeoutParams,
     RegisterRentToOwnDealParams,
     RecordRentToOwnEquityPaymentParams,
     RentToOwnDealActionParams,
     OraclePriceReading,
     CreateGovernanceProposalParams,
     GovernanceVoteParams,
     GovernanceProposal,
     UnsignedTransaction,
} from './adapter.js'
import { SorobanConfig } from './client.js'
import { RawReceiptEvent } from '../indexer/event-parser.js'
import { logger } from '../utils/logger.js'

/**
 * Governance constants mirrored from contracts/governance/src/lib.rs:8-14 so
 * the stub's create → vote → finalize → execute transitions line up with the
 * on-chain ones. This is a test double, not a reimplementation of the contract.
 */
const MIN_STAKE_TO_PROPOSE = 1n
const VOTING_PERIOD_SECS = 7 * 24 * 3600
const TIMELOCK_SECS = 48 * 3600
const QUORUM_BPS = 1_000n

/** Stub-only view of the on-chain state a proposal accumulates. */
interface StubGovernanceProposal extends GovernanceProposal {
     /** Addresses that have already voted, mirroring DataKey::Voted. */
     voters: Set<string>
}

export class StubSorobanAdapter implements SorobanAdapter {
     private static stubBalances = new Map<string, bigint>()
     private static stubBonds = new Map<string, bigint>()
     private static stubReputations = new Map<string, TenantReputationRecord>()
     private static stubProposals = new Map<number, StubGovernanceProposal>()
     private static stubProposalCount = 0
     /**
      * Stub stand-in for the contract's admin-mirrored DataKey::TotalStaked,
      * snapshotted into each proposal at creation time for quorum purposes.
      */
     private static stubTotalStaked = 1_000n
     private config: SorobanConfig

     constructor(config: SorobanConfig) {
          this.config = config
          logger.info('Soroban adapter: stub')
          logger.debug('Soroban stub config', { rpcUrl: config.rpcUrl })
          if (config.contractId) {
               logger.debug('Soroban stub config', { contractId: config.contractId })
          }
     }

     /**
      * Resets all stub state including balances for all instances.
      */
     public static _testOnlyReset(): void {
          this.stubBalances.clear()
          this.stubBonds.clear()
          this.stubReputations.clear()
          this.stubProposals.clear()
          this.stubProposalCount = 0
          this.clockOffsetSecs = 0
          logger.debug('Soroban stub: static reset complete (balances, bonds, reputations, and proposals cleared)')
     }

     /**
      * Resets instance-specific state and global stub balances.
      */
     public _testOnlyReset(): void {
          this._ledger = 1000
          StubSorobanAdapter._testOnlyReset()
          logger.debug('Soroban stub: instance reset complete')
     }

     async getBalance(account: string): Promise<bigint> {
          if (!StubSorobanAdapter.stubBalances.has(account)) {
               const hash = this.simpleHash(account)
               const balance = BigInt(1000 + (hash % 9000))
               StubSorobanAdapter.stubBalances.set(account, balance)
          }
          const balance = StubSorobanAdapter.stubBalances.get(account)!
          logger.debug('Soroban stub: getBalance', { account, balance: balance.toString() })
          return balance
     }

     async credit(account: string, amount: bigint): Promise<void> {
          const currentBalance = await this.getBalance(account)
          const newBalance = currentBalance + amount
          StubSorobanAdapter.stubBalances.set(account, newBalance)
          logger.debug('Soroban stub: credit', {
               account,
               amount: amount.toString(),
               newBalance: newBalance.toString(),
          })
     }

     async debit(account: string, amount: bigint): Promise<void> {
          const currentBalance = await this.getBalance(account)
          if (currentBalance < amount) {
               throw new Error(`Insufficient balance: ${currentBalance.toString()} < ${amount.toString()}`)
          }
          const newBalance = currentBalance - amount
          StubSorobanAdapter.stubBalances.set(account, newBalance)
          logger.debug('Soroban stub: debit', {
               account,
               amount: amount.toString(),
               newBalance: newBalance.toString(),
          })
     }

     async getStakedBalance(account: string): Promise<bigint> {
          const hash = this.simpleHash(`staked:${this.config.contractId ?? 'stub'}:${account}`)
          const staked = BigInt(hash % 5_000) * 1_000_000n
          logger.debug('Soroban stub: getStakedBalance', { account, staked: staked.toString() })
          return staked
     }

     async getClaimableRewards(account: string): Promise<bigint> {
          const hash = this.simpleHash(`claimable:${this.config.contractId ?? 'stub'}:${account}`)
          const claimable = BigInt(hash % 250) * 1_000_000n
          logger.debug('Soroban stub: getClaimableRewards', { account, claimable: claimable.toString() })
          return claimable
     }

     /**
      * Stub recordReceipt: logs the call but performs no on-chain work.
      *
      * The real on-chain `record_receipt` invocation lives in
      * `RealSorobanAdapter.recordReceipt` (real-adapter.ts), which is selected
      * when SOROBAN_ADAPTER_MODE=real (see `createSorobanAdapter` in index.ts).
      *
      * This stub is intentionally inert so local development and unit tests
      * never make network calls or require admin signing keys.
      */
     async recordReceipt(params: RecordReceiptParams): Promise<void> {
          logger.info('Soroban stub: recordReceipt', {
               txId: params.txId,
               txType: params.txType,
               amountUsdc: params.amountUsdc,
               dealId: params.dealId,
          })
     }

     getConfig(): SorobanConfig {
          return { ...this.config }
     }

     private simpleHash(str: string): number {
          let hash = 0
          if (this.config.seed !== undefined) {
               const seedStr = typeof this.config.seed === 'number' ? this.config.seed.toString() : this.config.seed
               for (let i = 0; i < seedStr.length; i++) {
                    const char = seedStr.charCodeAt(i)
                    hash = ((hash << 5) - hash) + char
                    hash = hash & hash
               }
          }
          for (let i = 0; i < str.length; i++) {
               const char = str.charCodeAt(i)
               hash = ((hash << 5) - hash) + char
               hash = hash & hash
          }
          return Math.abs(hash)
     }

     private _ledger = 1000
     async getReceiptEvents(fromLedger: number | null): Promise<RawReceiptEvent[]> {
          const ledger = (fromLedger ?? this._ledger) + 1
          this._ledger = ledger
          return [{
               ledger, txHash: `stub_${ledger}`, contractId: this.config.contractId ?? 'stub',
               data: {
                    tx_id: `txid_${ledger}`, tx_type: 'PAYMENT', deal_id: `deal_${ledger % 5}`,
                    amount_usdc: '10000000', external_ref: `txid_${ledger}` // Contract stores as 'external_ref' (same as tx_id)
               }
          }]
     }

     async getTimelockEvents(fromLedger: number | null): Promise<any[]> {
          const ledger = (fromLedger ?? this._ledger) + 1
          this._ledger = ledger
          // Only emit an event occasionally to simulate a realistic queue
          if (ledger % 10 !== 0) return []
          
          return [{
               ledger, 
               txHash: `tx_${ledger}`, 
               contractId: this.config.contractId ?? 'stub_timelock',
               topic: ['governance', 'queued'],
               data: [
                    `hash_${ledger}`, // tx_hash_n
                    'StakingPool',
                    'pause',
                    [],
                    Math.floor(Date.now() / 1000) + 3600 // eta
               ]
          }]
     }

     async executeTimelock(txHash: string, target: string, functionName: string, args: any[], eta: number): Promise<string> {
    logger.info('Soroban stub: executeTimelock', { txHash, target, functionName, args, eta })
    return `stub_stellar_tx_hash_execute_${txHash}`
  }

  async cancelTimelock(txHash: string): Promise<string> {
    logger.info('Soroban stub: cancelTimelock', { txHash })
    return `stub_stellar_tx_hash_cancel_${txHash}`
  }

  async stakeBond(inspectorId: string, amount: bigint): Promise<void> {
       StubSorobanAdapter.stubBonds.set(inspectorId, amount)
       logger.debug('Soroban stub: stakeBond', { inspectorId, amount: amount.toString() })
  }

  async unstakeBond(inspectorId: string): Promise<void> {
       StubSorobanAdapter.stubBonds.delete(inspectorId)
       logger.debug('Soroban stub: unstakeBond', { inspectorId })
  }

  async isBonded(inspectorId: string): Promise<boolean> {
       const bonded = StubSorobanAdapter.stubBonds.has(inspectorId)
       logger.debug('Soroban stub: isBonded', { inspectorId, bonded })
       return bonded
  }

  async getBond(inspectorId: string): Promise<{ isBonded: boolean; amount: bigint }> {
       const amount = StubSorobanAdapter.stubBonds.get(inspectorId) ?? 0n
       const bonded = StubSorobanAdapter.stubBonds.has(inspectorId)
       logger.debug('Soroban stub: getBond', { inspectorId, bonded, amount: amount.toString() })
       return { isBonded: bonded, amount }
  }

  // Admin operations (stub implementations)
     async pause(contractId: string): Promise<string> {
          logger.info('Soroban stub: pause', { contractId })
          return 'stub_tx_hash_pause'
     }

     async unpause(contractId: string): Promise<string> {
          logger.info('Soroban stub: unpause', { contractId })
          return 'stub_tx_hash_unpause'
     }

     async setOperator(contractId: string, operatorAddress: string | null): Promise<string> {
          logger.info('Soroban stub: setOperator', { contractId, operatorAddress })
          return 'stub_tx_hash_set_operator'
     }

     async init(contractId: string, adminAddress: string, operatorAddress?: string): Promise<string> {
          logger.info('Soroban stub: init', { contractId, adminAddress, operatorAddress })
          return 'stub_tx_hash_init'
     }

     async syncDealStatus(params: SyncDealStatusParams): Promise<void> {
          logger.info('Soroban stub: syncDealStatus', { ...params })
     }

async requestRentRelease(params: RequestRentReleaseParams): Promise<void> {
          logger.info('Soroban stub: requestRentRelease', { ...params })
     }

     async challengeRentRelease(params: ChallengeRentReleaseParams): Promise<void> {
          logger.info('Soroban stub: challengeRentRelease', { ...params })
     }

     async resolveRentDispute(params: ResolveRentDisputeParams): Promise<void> {
          logger.info('Soroban stub: resolveRentDispute', { ...params })
     }

     async settleRentReleaseTimeout(params: SettleRentReleaseTimeoutParams): Promise<void> {
          logger.info('Soroban stub: settleRentReleaseTimeout', { ...params })
     }

     async settleDisputeTimeout(params: SettleDisputeTimeoutParams): Promise<void> {
          logger.info('Soroban stub: settleDisputeTimeout', { ...params })
     }

     async registerRentToOwnDeal(params: RegisterRentToOwnDealParams): Promise<void> {
          logger.info('Soroban stub: registerRentToOwnDeal', { ...params })
     }

     async recordRentToOwnEquityPayment(params: RecordRentToOwnEquityPaymentParams): Promise<void> {
          logger.info('Soroban stub: recordRentToOwnEquityPayment', { ...params })
     }

     async completeRentToOwnDeal(params: RentToOwnDealActionParams): Promise<void> {
          logger.info('Soroban stub: completeRentToOwnDeal', { ...params })
     }

     async defaultRentToOwnDeal(params: RentToOwnDealActionParams): Promise<void> {
          logger.info('Soroban stub: defaultRentToOwnDeal', { ...params })
     }

     async updateTenantReputation(tenantId: string, record: TenantReputationRecord): Promise<void> {
          const updated: TenantReputationRecord = {
               ...record,
               lastUpdated: BigInt(Math.floor(Date.now() / 1000)),
          }
          StubSorobanAdapter.stubReputations.set(tenantId, updated)
          logger.info('Soroban stub: updateTenantReputation', { tenantId, compositeScore: record.compositeScore })
     }

     async getTenantReputation(tenantId: string): Promise<TenantReputationRecord | null> {
          const record = StubSorobanAdapter.stubReputations.get(tenantId) ?? null
          logger.debug('Soroban stub: getTenantReputation', { tenantId, found: record !== null })
          return record
     }

     /**
      * Deterministic stub price: matches the default FX_RATE_NGN_PER_USDC
      * (1600) scaled to the contract's 7-decimal precision, always fresh.
      */
     async getOraclePrice(pair: string): Promise<OraclePriceReading> {
          const decimals = 7
          const price = 1600n * 10n ** BigInt(decimals)
          logger.debug('Soroban stub: getOraclePrice', { pair, price: price.toString() })
          return { price, decimals, updatedAt: Math.floor(Date.now() / 1000), sequence: 1 }
     }

     async isOraclePriceStale(pair: string): Promise<boolean> {
          logger.debug('Soroban stub: isOraclePriceStale', { pair })
          return false
     }

     // ── governance contract (issue #1494) ─────────────────────────────────────
     //
     // The real flow is prepare (unsigned XDR) → wallet signs → submit. The stub
     // has no network and no wallet, so `xdr` here is a base64 JSON intent that
     // `submitGovernanceTransaction` decodes and applies. Signing is a no-op, so
     // tests can post the prepared string straight back to submit.

     /** Test-only clock offset (seconds) so tests can cross voting/timelock boundaries. */
     private static clockOffsetSecs = 0

     public static _testOnlyAdvanceTime(seconds: number): void {
          this.clockOffsetSecs += seconds
     }

     private static now(): number {
          return Math.floor(Date.now() / 1000) + this.clockOffsetSecs
     }

     private static encodeIntent(intent: Record<string, unknown>): string {
          return Buffer.from(JSON.stringify(intent), 'utf8').toString('base64')
     }

     async createProposal(params: CreateGovernanceProposalParams): Promise<UnsignedTransaction> {
          logger.debug('Soroban stub: createProposal (prepare)', {
               proposer: params.proposer,
               paramKey: params.paramKey,
          })
          return {
               xdr: StubSorobanAdapter.encodeIntent({
                    kind: 'create_proposal',
                    proposer: params.proposer,
                    paramKey: params.paramKey,
                    currentValue: params.currentValue.toString(),
                    proposedValue: params.proposedValue.toString(),
               }),
          }
     }

     async vote(params: GovernanceVoteParams): Promise<UnsignedTransaction> {
          logger.debug('Soroban stub: vote (prepare)', {
               voter: params.voter,
               proposalId: params.proposalId,
               support: params.support,
          })
          return {
               xdr: StubSorobanAdapter.encodeIntent({
                    kind: 'vote',
                    voter: params.voter,
                    proposalId: params.proposalId,
                    support: params.support,
               }),
          }
     }

     async submitGovernanceTransaction(signedXdr: string): Promise<{ txHash: string }> {
          let intent: any
          try {
               intent = JSON.parse(Buffer.from(signedXdr, 'base64').toString('utf8'))
          } catch {
               throw new Error('Signed transaction envelope could not be parsed')
          }

          if (intent?.kind === 'create_proposal') {
               const stake = await this.getStakedBalance(intent.proposer)
               if (stake < MIN_STAKE_TO_PROPOSE) {
                    throw new Error('InsufficientStake: proposer stake is below MIN_STAKE_TO_PROPOSE')
               }
               const id = ++StubSorobanAdapter.stubProposalCount
               const now = StubSorobanAdapter.now()
               StubSorobanAdapter.stubProposals.set(id, {
                    id,
                    proposer: intent.proposer,
                    paramKey: intent.paramKey,
                    currentValue: String(intent.currentValue),
                    proposedValue: String(intent.proposedValue),
                    votesFor: '0',
                    votesAgainst: '0',
                    status: 'Active',
                    createdAt: now,
                    votingEndsAt: now + VOTING_PERIOD_SECS,
                    snapshottedTotalStaked: StubSorobanAdapter.stubTotalStaked.toString(),
                    voters: new Set<string>(),
               })
               logger.debug('Soroban stub: createProposal (submitted)', { proposalId: id })
               return { txHash: `stub_tx_create_proposal_${id}` }
          }

          if (intent?.kind === 'vote') {
               const proposal = StubSorobanAdapter.stubProposals.get(Number(intent.proposalId))
               if (!proposal) throw new Error('ProposalNotFound')
               if (proposal.status !== 'Active') throw new Error('ProposalNotActive')
               if (StubSorobanAdapter.now() > proposal.votingEndsAt) {
                    throw new Error('VotingNotEnded: the voting period has already closed')
               }
               if (proposal.voters.has(intent.voter)) throw new Error('AlreadyVoted')

               // Weight = the voter's stake, snapshotted on their first vote —
               // matching contracts/governance/src/lib.rs:250-256.
               const weight = await this.getStakedBalance(intent.voter)
               proposal.voters.add(intent.voter)
               if (intent.support) {
                    proposal.votesFor = (BigInt(proposal.votesFor) + weight).toString()
               } else {
                    proposal.votesAgainst = (BigInt(proposal.votesAgainst) + weight).toString()
               }
               logger.debug('Soroban stub: vote (submitted)', {
                    proposalId: proposal.id,
                    support: intent.support,
                    weight: weight.toString(),
               })
               return { txHash: `stub_tx_vote_${proposal.id}` }
          }

          throw new Error(`Unsupported governance intent: ${String(intent?.kind)}`)
     }

     async finalizeProposal(proposalId: number): Promise<string> {
          const proposal = StubSorobanAdapter.stubProposals.get(proposalId)
          if (!proposal) throw new Error('ProposalNotFound')
          if (proposal.status !== 'Active') throw new Error('ProposalNotActive')
          if (StubSorobanAdapter.now() <= proposal.votingEndsAt) {
               throw new Error('VotingNotEnded: the voting period has not ended yet')
          }

          const totalVotes = BigInt(proposal.votesFor) + BigInt(proposal.votesAgainst)
          const quorumRequired =
               (BigInt(proposal.snapshottedTotalStaked) * QUORUM_BPS) / 10_000n
          proposal.status =
               totalVotes < quorumRequired
                    ? 'Rejected'
                    : BigInt(proposal.votesFor) > BigInt(proposal.votesAgainst)
                      ? 'Passed'
                      : 'Rejected'

          logger.debug('Soroban stub: finalizeProposal', {
               proposalId,
               status: proposal.status,
          })
          return `stub_tx_finalize_proposal_${proposalId}`
     }

     async executeProposal(proposalId: number): Promise<string> {
          const proposal = StubSorobanAdapter.stubProposals.get(proposalId)
          if (!proposal) throw new Error('ProposalNotFound')
          if (proposal.status === 'Executed') throw new Error('ProposalAlreadyExecuted')
          if (proposal.status !== 'Passed') throw new Error('ProposalNotPassed')
          if (StubSorobanAdapter.now() < proposal.votingEndsAt + TIMELOCK_SECS) {
               throw new Error('TimelockNotElapsed: the execution timelock has not elapsed yet')
          }
          proposal.status = 'Executed'
          logger.debug('Soroban stub: executeProposal', { proposalId })
          return `stub_tx_execute_proposal_${proposalId}`
     }

     async getProposal(proposalId: number): Promise<GovernanceProposal | null> {
          const proposal = StubSorobanAdapter.stubProposals.get(proposalId)
          if (!proposal) return null
          const { voters: _voters, ...view } = proposal
          return { ...view }
     }

     async getProposalCount(): Promise<number> {
          return StubSorobanAdapter.stubProposalCount
     }
}
