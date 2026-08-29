import { SorobanAdapter, RecordReceiptParams, SyncDealStatusParams, TenantReputationRecord } from './adapter.js'
import { SorobanConfig } from './client.js'
import { RawReceiptEvent } from '../indexer/event-parser.js'
import { logger } from '../utils/logger.js'


export class StubSorobanAdapter implements SorobanAdapter {
     private static stubBalances = new Map<string, bigint>()
     private static stubBonds = new Map<string, bigint>()
     private static stubReputations = new Map<string, TenantReputationRecord>()
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
          logger.debug('Soroban stub: static reset complete (balances, bonds, and reputations cleared)')
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

     // Contract access role management stub methods
     async proposeAssignRole(subject: string, role: number): Promise<string> {
          logger.info('Soroban stub: proposeAssignRole', { subject, role })
          return 'stub_tx_hash_propose_assign_role'
     }

     async confirmAssignRole(subject: string): Promise<string> {
          logger.info('Soroban stub: confirmAssignRole', { subject })
          return 'stub_tx_hash_confirm_assign_role'
     }

     async delegatePermission(delegatee: string, permission: number): Promise<string> {
          logger.info('Soroban stub: delegatePermission', { delegatee, permission })
          return 'stub_tx_hash_delegate_permission'
     }

     async getRole(address: string): Promise<number | null> {
          logger.debug('Soroban stub: getRole', { address })
          // Return Admin role (0) as default for stub
          return 0
     }

     async hasPermission(address: string, permission: number): Promise<boolean> {
          logger.debug('Soroban stub: hasPermission', { address, permission })
          // Return true for all permissions in stub mode
          return true
     }

     async listRoles(): Promise<Array<{ address: string; role: number }>> {
          logger.debug('Soroban stub: listRoles')
          return []
     }

     // Upgradeable proxy governance stub methods
     async proposeUpgrade(newWasmHash: string): Promise<string> {
          logger.info('Soroban stub: proposeUpgrade', { wasmHash: newWasmHash })
          return 'stub_tx_hash_propose_upgrade'
     }

     async confirmUpgrade(newWasmHash: string): Promise<string> {
          logger.info('Soroban stub: confirmUpgrade', { wasmHash: newWasmHash })
          return 'stub_tx_hash_confirm_upgrade'
     }

     async cancelUpgrade(): Promise<string> {
          logger.info('Soroban stub: cancelUpgrade')
          return 'stub_tx_hash_cancel_upgrade'
     }

     async transferAdmin(newAdminAddress: string): Promise<string> {
          logger.info('Soroban stub: transferAdmin', { newAdmin: newAdminAddress })
          return 'stub_tx_hash_transfer_admin'
     }

     async hasPendingUpgrade(): Promise<boolean> {
          logger.debug('Soroban stub: hasPendingUpgrade')
          return false
     }
}
