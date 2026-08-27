/**
 * Metrics-tracking wrapper for Soroban adapters
 * 
 * Wraps any SorobanAdapter to automatically track RPC call metrics
 */

import {
  SorobanAdapter,
  RecordReceiptParams,
  TenantReputationRecord,
  OraclePriceReading,
  CreateGovernanceProposalParams,
  GovernanceVoteParams,
  GovernanceProposal,
  UnsignedTransaction,
} from './adapter.js';
import { SorobanConfig } from './client.js';
import { RawReceiptEvent } from '../indexer/event-parser.js';
import { recordSorobanRpcCall } from '../utils/metrics.js';

export class MetricsSorobanAdapter implements SorobanAdapter {
  constructor(private readonly wrapped: SorobanAdapter) {}

  async getBalance(account: string): Promise<bigint> {
    return this.trackCall('getBalance', () => this.wrapped.getBalance(account));
  }

  async credit(account: string, amount: bigint): Promise<void> {
    return this.trackCall('credit', () => this.wrapped.credit(account, amount));
  }

  async debit(account: string, amount: bigint): Promise<void> {
    return this.trackCall('debit', () => this.wrapped.debit(account, amount));
  }

  async getStakedBalance(account: string): Promise<bigint> {
    return this.trackCall('getStakedBalance', () => this.wrapped.getStakedBalance(account));
  }

  async getClaimableRewards(account: string): Promise<bigint> {
    return this.trackCall('getClaimableRewards', () => this.wrapped.getClaimableRewards(account));
  }

  async recordReceipt(params: RecordReceiptParams): Promise<void> {
    return this.trackCall('recordReceipt', () => this.wrapped.recordReceipt(params));
  }

  getConfig(): SorobanConfig {
    return this.wrapped.getConfig();
  }

  async getReceiptEvents(fromLedger: number | null): Promise<RawReceiptEvent[]> {
    return this.trackCall('getReceiptEvents', () => this.wrapped.getReceiptEvents(fromLedger));
  }

  async getTimelockEvents(fromLedger: number | null): Promise<any[]> {
    return this.trackCall('getTimelockEvents', () => this.wrapped.getTimelockEvents(fromLedger));
  }

  async executeTimelock(
    txHash: string,
    target: string,
    functionName: string,
    args: any[],
    eta: number
  ): Promise<string> {
    return this.trackCall('executeTimelock', () =>
      this.wrapped.executeTimelock(txHash, target, functionName, args, eta)
    );
  }

  async cancelTimelock(txHash: string): Promise<string> {
    return this.trackCall('cancelTimelock', () => this.wrapped.cancelTimelock(txHash));
  }

  // Optional admin operations
  async pause?(contractId: string): Promise<string> {
    if (!this.wrapped.pause) {
      throw new Error('pause not implemented');
    }
    return this.trackCall('pause', () => this.wrapped.pause!(contractId));
  }

  async unpause?(contractId: string): Promise<string> {
    if (!this.wrapped.unpause) {
      throw new Error('unpause not implemented');
    }
    return this.trackCall('unpause', () => this.wrapped.unpause!(contractId));
  }

  async setOperator?(contractId: string, operatorAddress: string | null): Promise<string> {
    if (!this.wrapped.setOperator) {
      throw new Error('setOperator not implemented');
    }
    return this.trackCall('setOperator', () =>
      this.wrapped.setOperator!(contractId, operatorAddress)
    );
  }

  async init?(
    contractId: string,
    adminAddress: string,
    operatorAddress?: string
  ): Promise<string> {
    if (!this.wrapped.init) {
      throw new Error('init not implemented');
    }
    return this.trackCall('init', () =>
      this.wrapped.init!(contractId, adminAddress, operatorAddress)
    );
  }

  async updateTenantReputation?(tenantId: string, record: TenantReputationRecord): Promise<void> {
    if (!this.wrapped.updateTenantReputation) {
      throw new Error('updateTenantReputation not implemented');
    }
    return this.trackCall('updateTenantReputation', () =>
      this.wrapped.updateTenantReputation!(tenantId, record)
    );
  }

  async getTenantReputation?(tenantId: string): Promise<TenantReputationRecord | null> {
    if (!this.wrapped.getTenantReputation) {
      throw new Error('getTenantReputation not implemented');
    }
    return this.trackCall('getTenantReputation', () =>
      this.wrapped.getTenantReputation!(tenantId)
    );
  }

  async stakeBond(inspectorId: string, amount: bigint): Promise<void> {
    return this.trackCall('stakeBond', () => this.wrapped.stakeBond(inspectorId, amount))
  }

  async unstakeBond(inspectorId: string): Promise<void> {
    return this.trackCall('unstakeBond', () => this.wrapped.unstakeBond(inspectorId))
  }

  async isBonded(inspectorId: string): Promise<boolean> {
    return this.trackCall('isBonded', () => this.wrapped.isBonded(inspectorId))
  }

  async getBond(inspectorId: string): Promise<{ isBonded: boolean; amount: bigint }> {
    return this.trackCall('getBond', () => this.wrapped.getBond(inspectorId))
  }

  async getOraclePrice?(pair: string): Promise<OraclePriceReading> {
    if (!this.wrapped.getOraclePrice) {
      throw new Error('getOraclePrice not implemented');
    }
    return this.trackCall('getOraclePrice', () => this.wrapped.getOraclePrice!(pair));
  }

  async isOraclePriceStale?(pair: string): Promise<boolean> {
    if (!this.wrapped.isOraclePriceStale) {
      throw new Error('isOraclePriceStale not implemented');
    }
    return this.trackCall('isOraclePriceStale', () => this.wrapped.isOraclePriceStale!(pair));
  }

  // governance contract (issue #1494)
  async createProposal?(params: CreateGovernanceProposalParams): Promise<UnsignedTransaction> {
    if (!this.wrapped.createProposal) {
      throw new Error('createProposal not implemented');
    }
    return this.trackCall('createProposal', () => this.wrapped.createProposal!(params));
  }

  async vote?(params: GovernanceVoteParams): Promise<UnsignedTransaction> {
    if (!this.wrapped.vote) {
      throw new Error('vote not implemented');
    }
    return this.trackCall('vote', () => this.wrapped.vote!(params));
  }

  async submitGovernanceTransaction?(signedXdr: string): Promise<{ txHash: string }> {
    if (!this.wrapped.submitGovernanceTransaction) {
      throw new Error('submitGovernanceTransaction not implemented');
    }
    return this.trackCall('submitGovernanceTransaction', () =>
      this.wrapped.submitGovernanceTransaction!(signedXdr)
    );
  }

  async finalizeProposal?(proposalId: number): Promise<string> {
    if (!this.wrapped.finalizeProposal) {
      throw new Error('finalizeProposal not implemented');
    }
    return this.trackCall('finalizeProposal', () => this.wrapped.finalizeProposal!(proposalId));
  }

  async executeProposal?(proposalId: number): Promise<string> {
    if (!this.wrapped.executeProposal) {
      throw new Error('executeProposal not implemented');
    }
    return this.trackCall('executeProposal', () => this.wrapped.executeProposal!(proposalId));
  }

  async getProposal?(proposalId: number): Promise<GovernanceProposal | null> {
    if (!this.wrapped.getProposal) {
      throw new Error('getProposal not implemented');
    }
    return this.trackCall('getProposal', () => this.wrapped.getProposal!(proposalId));
  }

  async getProposalCount?(): Promise<number> {
    if (!this.wrapped.getProposalCount) {
      throw new Error('getProposalCount not implemented');
    }
    return this.trackCall('getProposalCount', () => this.wrapped.getProposalCount!());
  }

  /**
   * Helper method to track RPC calls with metrics
   */
  private async trackCall<T>(method: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    let success = true;
    let errorType: string | undefined;

    try {
      const result = await fn();
      return result;
    } catch (error) {
      success = false;
      errorType = error instanceof Error ? error.constructor.name : 'UnknownError';
      throw error;
    } finally {
      const durationMs = Date.now() - start;
      recordSorobanRpcCall(method, durationMs, success, errorType);
    }
  }
}
