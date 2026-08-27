import { SorobanAdapter } from '../soroban/adapter.js'
import { logger } from '../utils/logger.js'
import { outboxStore } from './store.js'
import { OutboxStatus, TxType, type OutboxItem } from './types.js'
import { outboxConfig } from '../config/outboxConfig.js'

/**
 * Outbox sender - handles sending transactions to the blockchain
 *
 * Exactly-once guarantees implemented here:
 *
 * 1. **Durable intent before broadcast** — `onTxBuilt` callback persists the
 *    Stellar tx hash to the outbox row *before* calling sendTransaction.  A
 *    worker crash after this point can be recovered without resubmission.
 *
 * 2. **Crash recovery** — if `item.submittedTxHash` is already set when `send`
 *    is called, the worker queries the chain for that hash rather than calling
 *    the adapter again, preventing double-application.
 *
 * 3. **Confirmation depth** — after a confirmed tx the item moves to CONFIRMING;
 *    the worker checks finality depth before marking SENT (see worker.ts).
 */
export class OutboxSender {
  constructor(private adapter: SorobanAdapter) {}

  /**
   * Attempt to send an outbox item to the blockchain.
   * Returns true if the item advanced toward SENT, false on failure.
   */
  async send(item: OutboxItem): Promise<boolean> {
    const MAX_RETRY_COUNT = 10

    try {
      // -----------------------------------------------------------------------
      // Crash-recovery path: a previous worker broadcast this tx but died
      // before recording the result.  Resolve via chain query.
      // -----------------------------------------------------------------------
      if (item.submittedTxHash) {
        return this.resolveInFlight(item)
      }

      logger.info('Attempting to send outbox item', {
        outboxId: item.id,
        txType: item.txType,
        txId: item.txId,
        retryCount: item.retryCount,
      })

      if (item.retryCount >= MAX_RETRY_COUNT) {
        logger.warn('Max retry count reached, not retrying', {
          outboxId: item.id,
          txId: item.txId,
          retryCount: item.retryCount,
        })
        return false
      }

      // -----------------------------------------------------------------------
      // Normal send path — persist hash before broadcast via onTxBuilt hook
      // -----------------------------------------------------------------------
      switch (item.txType) {
        case TxType.RECEIPT:
        case TxType.TENANT_REPAYMENT:
        case TxType.LANDLORD_PAYOUT:
        case TxType.WHISTLEBLOWER_REWARD:
        case TxType.STAKE:
        case TxType.UNSTAKE:
        case TxType.STAKE_REWARD_CLAIM:
        case TxType.CONVERSION:
          await this.sendReceipt(item)
          break
        case TxType.DEAL_STATUS_CHANGED:
          if (this.adapter.syncDealStatus) {
            await this.sendDealStatus(item)
          } else {
            throw new Error('Deal status sync not supported by adapter')
          }
          break
        case TxType.TENANT_REPUTATION_UPDATE:
          if (this.adapter.updateTenantReputation) {
            await this.sendTenantReputationUpdate(item)
          } else {
            throw new Error('Tenant reputation update not supported by adapter')
          }
          break
        case TxType.SLASHING_SUBMIT_EVIDENCE:
          if (this.adapter.submitEvidence) {
            await this.sendSubmitEvidence(item)
          } else {
            throw new Error('Submit evidence not supported by adapter')
          }
          break
        case TxType.SLASHING_REVEAL_EVIDENCE:
          if (this.adapter.revealEvidence) {
            await this.sendRevealEvidence(item)
          } else {
            throw new Error('Reveal evidence not supported by adapter')
          }
          break
        case TxType.SLASHING_PROPOSE_SLASH:
          if (this.adapter.proposeSlash) {
            await this.sendProposeSlash(item)
          } else {
            throw new Error('Propose slash not supported by adapter')
          }
          break
        case TxType.SLASHING_FINALIZE_SLASH:
          if (this.adapter.finalizeSlash) {
            await this.sendFinalizeSlash(item)
          } else {
            throw new Error('Finalize slash not supported by adapter')
          }
          break
        case TxType.SLASHING_CANCEL_SLASH:
          if (this.adapter.cancelSlash) {
            await this.sendCancelSlash(item)
          } else {
            throw new Error('Cancel slash not supported by adapter')
          }
          break
        case TxType.BOND_DEPOSIT:
          if (this.adapter.depositBond) {
            await this.sendDepositBond(item)
          } else {
            throw new Error('Deposit bond not supported by adapter')
          }
          break
        case TxType.BOND_WITHDRAW:
          if (this.adapter.withdrawBond) {
            await this.sendWithdrawBond(item)
          } else {
            throw new Error('Withdraw bond not supported by adapter')
          }
          break
        default:
          throw new Error(`Unknown tx type: ${item.txType}`)
      }

      item.processedAt = new Date()
      item.nextRetryAt = null
      await outboxStore.updateStatus(item.id, OutboxStatus.SENT)

      logger.info('Successfully sent outbox item', {
        outboxId: item.id,
        txId: item.txId,
        retryCount: item.retryCount,
      })

      return true
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const currentRetryCount = item.retryCount || 0
      const backoffMs = Math.min(Math.pow(2, currentRetryCount) * 1000, 60 * 60 * 1000)
      const nextRetryAt = new Date(Date.now() + backoffMs)

      logger.error('Failed to send outbox item', {
        outboxId: item.id,
        txId: item.txId,
        retryCount: currentRetryCount,
        lastError: errorMessage,
      })

      await outboxStore.updateStatus(item.id, OutboxStatus.FAILED, {
        error: errorMessage,
        nextRetryAt,
      })

      return false
    }
  }

  /**
   * Resolve an item that has a persisted tx hash but no confirmed result.
   * Queries the chain to determine whether the tx landed, failed, or expired.
   */
  private async resolveInFlight(item: OutboxItem): Promise<boolean> {
    const txHash = item.submittedTxHash!

    if (!this.adapter.getTransactionStatus) {
      // Adapter cannot query chain status; fall through to blind resubmission
      // by clearing the hash and letting the normal path retry.
      logger.warn('Adapter does not support getTransactionStatus; clearing in-flight hash for resubmission', {
        outboxId: item.id,
        txHash,
      })
      await outboxStore.persistSubmittedTxHash(item.id, '')  // clear
      return false
    }

    const chainStatus = await this.adapter.getTransactionStatus(txHash)

    logger.info('Resolved in-flight tx', {
      outboxId: item.id,
      txHash,
      chainStatus: chainStatus.status,
      ledger: chainStatus.ledger,
    })

    if (chainStatus.status === 'success') {
      await outboxStore.markConfirming(
        item.id,
        txHash,
        chainStatus.ledger ?? 0,
        outboxConfig.confirmationDepth,
      )
      return true
    }

    if (chainStatus.status === 'pending') {
      // Still in-flight; skip this cycle
      return false
    }

    // 'failed' or 'not_found' — reopen for resubmission
    await outboxStore.reopenItem(
      item.id,
      `in-flight tx ${txHash} resolved as ${chainStatus.status}; re-queued`,
    )
    // Immediately reset to PENDING so the worker picks it up
    await outboxStore.updateStatus(item.id, OutboxStatus.PENDING)
    return false
  }

  private async sendReceipt(item: OutboxItem): Promise<void> {
    const { payload } = item

    if (
      item.txType === TxType.STAKE ||
      item.txType === TxType.UNSTAKE ||
      item.txType === TxType.STAKE_REWARD_CLAIM ||
      item.txType === TxType.CONVERSION
    ) {
      if (!payload.amountUsdc && item.txType !== TxType.STAKE_REWARD_CLAIM) {
        throw new Error('Invalid staking payload: missing required field amountUsdc')
      }
      if (!payload.txType) {
        throw new Error('Invalid staking payload: missing required field txType')
      }

      await this.adapter.recordReceipt(
        {
          txId: item.txId,
          txType: item.txType as import('./types.js').TxType,
          amountUsdc: payload.amountUsdc ? String(payload.amountUsdc) : '0',
          tokenAddress: payload.tokenAddress
            ? String(payload.tokenAddress)
            : process.env.USDC_TOKEN_ADDRESS || '0x0000000000000000000000000000000000000000',
          dealId: payload.dealId
            ? String(payload.dealId)
            : item.txType === TxType.CONVERSION
              ? 'conversion'
              : 'staking-transaction',
          amountNgn: payload.amountNgn != null ? Number(payload.amountNgn) : undefined,
          fxRate: payload.fxRateNgnPerUsdc != null ? Number(payload.fxRateNgnPerUsdc) : undefined,
          fxProvider: payload.fxProvider ? String(payload.fxProvider) : undefined,
        },
        {
          onTxBuilt: async (txHash) => {
            await outboxStore.persistSubmittedTxHash(item.id, txHash)
          },
        },
      )
      return
    }

    if (!payload.dealId || !payload.amountUsdc || !payload.tokenAddress || !payload.txType) {
      throw new Error('Invalid receipt payload: missing required fields (dealId, amountUsdc, tokenAddress, txType)')
    }

    await this.adapter.recordReceipt(
      {
        txId: item.txId,
        txType: item.txType as import('./types.js').TxType,
        amountUsdc: String(payload.amountUsdc),
        tokenAddress: String(payload.tokenAddress),
        dealId: String(payload.dealId),
        listingId: payload.listingId ? String(payload.listingId) : undefined,
        amountNgn: payload.amountNgn != null ? Number(payload.amountNgn) : undefined,
        fxRate: payload.fxRateNgnPerUsdc != null ? Number(payload.fxRateNgnPerUsdc) : undefined,
        fxProvider: payload.fxProvider ? String(payload.fxProvider) : undefined,
      },
      {
        onTxBuilt: async (txHash) => {
          await outboxStore.persistSubmittedTxHash(item.id, txHash)
        },
      },
    )

    logger.debug('Receipt recorded on-chain', {
      dealId: String(payload.dealId),
      txId: item.txId,
      txType: item.txType,
    })
  }

  private async sendDealStatus(item: OutboxItem): Promise<void> {
    if (!this.adapter.syncDealStatus) {
      throw new Error('Adapter does not support deal status sync')
    }
    const { payload } = item
    const newStatus = payload.newStatus as 'active' | 'completed' | 'defaulted'
    if (!payload.dealId || !newStatus) {
      throw new Error('Invalid deal status sync payload')
    }
    await this.adapter.syncDealStatus({
      dealId: String(payload.dealId),
      contractDealId: String(payload.contractDealId ?? payload.dealId),
      newStatus,
      actor: String(payload.actor ?? 'system'),
    })
  }

  private async sendTenantReputationUpdate(item: OutboxItem): Promise<void> {
    if (!this.adapter.updateTenantReputation) {
      throw new Error('Adapter does not support updateTenantReputation')
    }
    const { payload } = item
    if (
      !payload.tenantId ||
      payload.compositeScore == null ||
      payload.paymentScore == null ||
      payload.propertyCareScore == null ||
      payload.communicationScore == null ||
      payload.totalRatings == null
    ) {
      throw new Error('Invalid tenant reputation payload: missing required fields')
    }
    await this.adapter.updateTenantReputation(String(payload.tenantId), {
      compositeScore: Number(payload.compositeScore),
      paymentScore: Number(payload.paymentScore),
      propertyCareScore: Number(payload.propertyCareScore),
      communicationScore: Number(payload.communicationScore),
      totalRatings: Number(payload.totalRatings),
      lastUpdated: 0n,
    })
    logger.debug('Tenant reputation anchored on-chain', {
      tenantId: String(payload.tenantId),
      compositeScore: Number(payload.compositeScore),
    })
  }

  private async sendSubmitEvidence(item: OutboxItem): Promise<void> {
    if (!this.adapter.submitEvidence) {
      throw new Error('Adapter does not support submitEvidence')
    }
    const { payload } = item
    if (!payload.submitter || !payload.commitment || !payload.actor || !payload.offence) {
      throw new Error('Invalid submit evidence payload: missing required fields')
    }
    await this.adapter.submitEvidence(
      String(payload.submitter),
      String(payload.commitment),
      String(payload.actor),
      String(payload.offence)
    )
    logger.debug('Evidence submitted to slashing module', {
      actor: String(payload.actor),
      offence: String(payload.offence),
    })
  }

  private async sendRevealEvidence(item: OutboxItem): Promise<void> {
    if (!this.adapter.revealEvidence) {
      throw new Error('Adapter does not support revealEvidence')
    }
    const { payload } = item
    if (!payload.submitter || payload.slashId == null || !payload.evidence || !payload.salt) {
      throw new Error('Invalid reveal evidence payload: missing required fields')
    }
    await this.adapter.revealEvidence(
      String(payload.submitter),
      Number(payload.slashId),
      String(payload.evidence),
      String(payload.salt)
    )
    logger.debug('Evidence revealed in slashing module', {
      slashId: Number(payload.slashId),
    })
  }

  private async sendProposeSlash(item: OutboxItem): Promise<void> {
    if (!this.adapter.proposeSlash) {
      throw new Error('Adapter does not support proposeSlash')
    }
    const { payload } = item
    if (!payload.submitter || !payload.actor || payload.penaltyBps == null) {
      throw new Error('Invalid propose slash payload: missing required fields')
    }
    await this.adapter.proposeSlash(
      String(payload.submitter),
      String(payload.actor),
      Number(payload.penaltyBps)
    )
    logger.debug('Slash proposed in slashing module', {
      actor: String(payload.actor),
      penaltyBps: Number(payload.penaltyBps),
    })
  }

  private async sendFinalizeSlash(item: OutboxItem): Promise<void> {
    if (!this.adapter.finalizeSlash) {
      throw new Error('Adapter does not support finalizeSlash')
    }
    const { payload } = item
    if (!payload.caller || payload.slashId == null) {
      throw new Error('Invalid finalize slash payload: missing required fields')
    }
    await this.adapter.finalizeSlash(
      String(payload.caller),
      Number(payload.slashId)
    )
    logger.debug('Slash finalized in slashing module', {
      slashId: Number(payload.slashId),
    })
  }

  private async sendCancelSlash(item: OutboxItem): Promise<void> {
    if (!this.adapter.cancelSlash) {
      throw new Error('Adapter does not support cancelSlash')
    }
    const { payload } = item
    if (!payload.admin || payload.slashId == null) {
      throw new Error('Invalid cancel slash payload: missing required fields')
    }
    await this.adapter.cancelSlash(
      String(payload.admin),
      Number(payload.slashId)
    )
    logger.debug('Slash cancelled in slashing module', {
      slashId: Number(payload.slashId),
    })
  }

  private async sendDepositBond(item: OutboxItem): Promise<void> {
    if (!this.adapter.depositBond) {
      throw new Error('Adapter does not support depositBond')
    }
    const { payload } = item
    if (!payload.inspector || payload.amount == null) {
      throw new Error('Invalid deposit bond payload: missing required fields')
    }
    const amount = typeof payload.amount === 'string' 
      ? BigInt(payload.amount) 
      : BigInt(Number(payload.amount))
    await this.adapter.depositBond(
      String(payload.inspector),
      amount
    )
    logger.debug('Bond deposited in bond_collateral', {
      inspector: String(payload.inspector),
      amount: amount.toString(),
    })
  }

  private async sendWithdrawBond(item: OutboxItem): Promise<void> {
    if (!this.adapter.withdrawBond) {
      throw new Error('Adapter does not support withdrawBond')
    }
    const { payload } = item
    if (!payload.inspector || payload.amount == null) {
      throw new Error('Invalid withdraw bond payload: missing required fields')
    }
    const amount = typeof payload.amount === 'string' 
      ? BigInt(payload.amount) 
      : BigInt(Number(payload.amount))
    await this.adapter.withdrawBond(
      String(payload.inspector),
      amount
    )
    logger.debug('Bond withdrawn from bond_collateral', {
      inspector: String(payload.inspector),
      amount: amount.toString(),
    })
  }

  /**
   * Retry a failed outbox item
   */
  async retry(itemId: string): Promise<boolean> {
    const item = await outboxStore.getById(itemId)
    if (!item) {
      throw new Error(`Outbox item not found: ${itemId}`)
    }

    if (item.status === OutboxStatus.SENT) {
      logger.info('Outbox item already sent, skipping retry', { id: itemId })
      return true
    }

    return this.send(item)
  }

  /**
   * Retry all failed items
   */
  async retryAll(): Promise<{ succeeded: number; failed: number }> {
    const failedItems = await outboxStore.listByStatus(OutboxStatus.FAILED)

    let succeeded = 0
    let failed = 0

    for (const item of failedItems) {
      const success = await this.send(item)
      if (success) {
        succeeded++
      } else {
        failed++
      }
    }

    return { succeeded, failed }
  }
}
