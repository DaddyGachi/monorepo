import { Router, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { authenticateToken, type AuthenticatedRequest } from '../middleware/auth.js'
import type { GovernanceProposal, SorobanAdapter } from '../soroban/adapter.js'
import type { LinkedAddressStore } from '../models/linkedAddressStore.js'
import { AppError } from '../errors/AppError.js'
import { ErrorCode } from '../errors/errorCodes.js'
import { logger } from '../utils/logger.js'

/**
 * Stake-weighted parameter governance (contracts/governance), issue #1494.
 *
 * Two-phase writes: `create_proposal` and `vote` call `require_auth()` on the
 * proposer/voter on-chain, so the backend can only *prepare* an unsigned
 * envelope; the connected wallet signs it and posts it back to `/submit`.
 * `finalize_proposal` / `execute_proposal` take no Address and call no
 * `require_auth()` at all — they are permissionless once their time conditions
 * are met, so the backend can submit them directly.
 *
 * Note this contract is unrelated to the timelock contract, which merely uses
 * "governance" as its event-topic namespace.
 */

/**
 * MIN_STAKE_TO_PROPOSE, mirrored from contracts/governance/src/lib.rs:14.
 */
const MIN_STAKE_TO_PROPOSE = 1n

const prepareProposalSchema = z.object({
  // `param_key` is an arbitrary Soroban Symbol — the contract neither validates
  // nor enumerates it. We only enforce what Soroban itself requires of a
  // Symbol: up to 32 characters of [a-zA-Z0-9_].
  paramKey: z
    .string()
    .min(1)
    .max(32)
    .regex(/^[A-Za-z0-9_]+$/, 'paramKey must be a Soroban symbol ([A-Za-z0-9_], max 32 chars)'),
  currentValue: z.union([z.string(), z.number()]),
  proposedValue: z.union([z.string(), z.number()]),
})

const submitSchema = z.object({
  signedXdr: z.string().min(1),
})

const voteSchema = z.object({
  support: z.boolean(),
})

function parseI128(value: string | number, field: string): bigint {
  try {
    return BigInt(typeof value === 'number' ? Math.trunc(value) : value.trim())
  } catch {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      400,
      `${field} must be an integer value`,
    )
  }
}

function parseProposalId(raw: string): number {
  const id = Number(raw)
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 400, 'proposal id must be a positive integer')
  }
  return id
}

/**
 * Map a governance contract rejection onto an HTTP status.
 *
 * The contract signals failures via its `ContractError` enum
 * (contracts/governance/src/lib.rs:40-52). Soroban surfaces those as opaque
 * `Error(Contract, #n)` strings rather than typed values, so — like
 * `isDuplicateReceiptError` elsewhere in this codebase — we match on the
 * variant name that the adapter puts in the message. Anything unrecognized is
 * passed through untouched so the central error handler classifies it.
 */
const CONTRACT_ERROR_MAP: ReadonlyArray<{
  needle: string
  code: ErrorCode
  status: number
  message: string
}> = [
  {
    needle: 'ProposalNotFound',
    code: ErrorCode.NOT_FOUND,
    status: 404,
    message: 'Proposal not found',
  },
  {
    needle: 'InsufficientStake',
    code: ErrorCode.FORBIDDEN,
    status: 403,
    message: 'Stake is below the minimum required to propose',
  },
  {
    needle: 'AlreadyVoted',
    code: ErrorCode.CONFLICT,
    status: 409,
    message: 'This address has already voted on the proposal',
  },
  {
    needle: 'ProposalAlreadyExecuted',
    code: ErrorCode.CONFLICT,
    status: 409,
    message: 'Proposal has already been executed',
  },
  {
    needle: 'VotingNotEnded',
    code: ErrorCode.INVALID_STATE_TRANSITION,
    status: 409,
    message: 'The proposal is not ready: its voting period has not ended yet',
  },
  {
    needle: 'TimelockNotElapsed',
    code: ErrorCode.INVALID_STATE_TRANSITION,
    status: 409,
    message: 'The proposal is not ready: its execution timelock has not elapsed yet',
  },
  {
    needle: 'ProposalNotActive',
    code: ErrorCode.INVALID_STATE_TRANSITION,
    status: 409,
    message: 'Proposal is no longer active',
  },
  {
    needle: 'ProposalNotPassed',
    code: ErrorCode.INVALID_STATE_TRANSITION,
    status: 409,
    message: 'Proposal has not passed and cannot be executed',
  },
  {
    needle: 'QuorumNotReached',
    code: ErrorCode.INVALID_STATE_TRANSITION,
    status: 409,
    message: 'Proposal did not reach quorum',
  },
  {
    needle: 'NotAuthorized',
    code: ErrorCode.FORBIDDEN,
    status: 403,
    message: 'Not authorized to perform this governance action',
  },
]

function mapGovernanceError(err: unknown): unknown {
  if (err instanceof AppError) return err
  const message = err instanceof Error ? err.message : String(err)
  const match = CONTRACT_ERROR_MAP.find((entry) => message.includes(entry.needle))
  if (!match) return err
  return new AppError(match.code, match.status, match.message)
}

/** Optional adapter methods are undefined on adapters that do not implement them. */
function requireCapability<T>(fn: T | undefined, name: string): T {
  if (typeof fn !== 'function') {
    throw new AppError(
      ErrorCode.SERVICE_UNAVAILABLE,
      503,
      `Governance is not available: the configured Soroban adapter does not implement ${name}`,
    )
  }
  return fn
}

export function createGovernanceRouter(
  adapter: SorobanAdapter,
  linkedAddressStore: LinkedAddressStore,
): Router {
  const router = Router()

  /**
   * Resolve the caller's own Stellar address. This address becomes the source
   * account of the unsigned envelope, so it must be the wallet that will sign.
   */
  async function resolveCallerAddress(req: AuthenticatedRequest): Promise<string> {
    const userId = req.user?.id
    if (!userId) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 401, 'Authentication required')
    }
    const linked = await linkedAddressStore.getLinkedAddress(userId)
    if (!linked) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        400,
        'No linked wallet address found for user. Link a Stellar wallet before using governance.',
      )
    }
    return linked
  }

  router.get(
    '/proposals',
    authenticateToken,
    async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const getCount = requireCapability(
          adapter.getProposalCount?.bind(adapter),
          'getProposalCount',
        )
        const getProposal = requireCapability(adapter.getProposal?.bind(adapter), 'getProposal')

        // Proposal ids are 1-based and monotonically increasing
        // (contracts/governance/src/lib.rs:177-179).
        const count = await getCount()
        const ids = Array.from({ length: Math.max(0, count) }, (_, i) => i + 1)
        const settled = await Promise.all(ids.map((id) => getProposal(id)))
        const proposals = settled.filter((p): p is GovernanceProposal => p !== null)

        res.json({ success: true, proposals, count })
      } catch (error) {
        next(mapGovernanceError(error))
      }
    },
  )

  router.get(
    '/proposals/:id',
    authenticateToken,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const getProposal = requireCapability(adapter.getProposal?.bind(adapter), 'getProposal')
        const id = parseProposalId(req.params.id)
        const proposal = await getProposal(id)
        if (!proposal) {
          throw new AppError(ErrorCode.NOT_FOUND, 404, `Proposal ${id} not found`)
        }
        res.json({ success: true, proposal })
      } catch (error) {
        next(mapGovernanceError(error))
      }
    },
  )

  /**
   * Build the unsigned `create_proposal` envelope for the caller's wallet.
   */
  router.post(
    '/proposals/prepare',
    authenticateToken,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const createProposal = requireCapability(
          adapter.createProposal?.bind(adapter),
          'createProposal',
        )
        const body = prepareProposalSchema.parse(req.body ?? {})
        const proposer = await resolveCallerAddress(req)

        // Informational pre-check only: this reads the REAL staking_pool
        // balance, whereas the authoritative on-chain gate is the governance
        // contract's own `get_stake_for` (contracts/governance/src/lib.rs:111),
        // which reads an admin-mirrored slot rather than cross-calling
        // staking_pool. The two can disagree — see the PR's known limitations.
        const staked = await adapter.getStakedBalance(proposer)
        if (staked < MIN_STAKE_TO_PROPOSE) {
          throw new AppError(
            ErrorCode.FORBIDDEN,
            403,
            'Insufficient stake to create a governance proposal',
            {
              stakedBalance: staked.toString(),
              minimumRequired: MIN_STAKE_TO_PROPOSE.toString(),
            },
          )
        }

        const { xdr } = await createProposal({
          proposer,
          paramKey: body.paramKey,
          currentValue: parseI128(body.currentValue, 'currentValue'),
          proposedValue: parseI128(body.proposedValue, 'proposedValue'),
        })

        logger.info('Governance proposal prepared', {
          requestId: req.requestId,
          userId: req.user?.id,
          paramKey: body.paramKey,
        })
        res.json({ success: true, xdr })
      } catch (error) {
        next(mapGovernanceError(error))
      }
    },
  )

  router.post(
    '/proposals/submit',
    authenticateToken,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const submit = requireCapability(
          adapter.submitGovernanceTransaction?.bind(adapter),
          'submitGovernanceTransaction',
        )
        const { signedXdr } = submitSchema.parse(req.body ?? {})
        const { txHash } = await submit(signedXdr)
        logger.info('Governance proposal submitted', {
          requestId: req.requestId,
          userId: req.user?.id,
          txHash,
        })
        res.json({ success: true, txHash })
      } catch (error) {
        next(mapGovernanceError(error))
      }
    },
  )

  router.post(
    '/proposals/:id/vote/prepare',
    authenticateToken,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const prepareVote = requireCapability(adapter.vote?.bind(adapter), 'vote')
        const proposalId = parseProposalId(req.params.id)
        const { support } = voteSchema.parse(req.body ?? {})
        // Passed through untouched: vote weight is snapshotted on-chain from
        // this exact address, and is a contract-level guarantee.
        const voter = await resolveCallerAddress(req)

        const { xdr } = await prepareVote({ voter, proposalId, support })
        logger.info('Governance vote prepared', {
          requestId: req.requestId,
          userId: req.user?.id,
          proposalId,
          support,
        })
        res.json({ success: true, xdr })
      } catch (error) {
        next(mapGovernanceError(error))
      }
    },
  )

  router.post(
    '/proposals/:id/vote/submit',
    authenticateToken,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const submit = requireCapability(
          adapter.submitGovernanceTransaction?.bind(adapter),
          'submitGovernanceTransaction',
        )
        parseProposalId(req.params.id)
        const { signedXdr } = submitSchema.parse(req.body ?? {})
        const { txHash } = await submit(signedXdr)
        logger.info('Governance vote submitted', {
          requestId: req.requestId,
          userId: req.user?.id,
          txHash,
        })
        res.json({ success: true, txHash })
      } catch (error) {
        next(mapGovernanceError(error))
      }
    },
  )

  /**
   * Permissionless on-chain — no user signature is involved, the backend just
   * pays the fee and submits once the voting period has ended.
   */
  router.post(
    '/proposals/:id/finalize',
    authenticateToken,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const finalize = requireCapability(
          adapter.finalizeProposal?.bind(adapter),
          'finalizeProposal',
        )
        const proposalId = parseProposalId(req.params.id)
        const txHash = await finalize(proposalId)
        logger.info('Governance proposal finalized', {
          requestId: req.requestId,
          userId: req.user?.id,
          proposalId,
          txHash,
        })
        res.json({ success: true, txHash })
      } catch (error) {
        next(mapGovernanceError(error))
      }
    },
  )

  /**
   * Permissionless on-chain. Note that `execute_proposal` flips the proposal's
   * status and emits `proposal_executed`; it does not itself apply
   * `proposed_value` anywhere — applying it is an off-chain/other-contract
   * action driven by that event.
   */
  router.post(
    '/proposals/:id/execute',
    authenticateToken,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const execute = requireCapability(
          adapter.executeProposal?.bind(adapter),
          'executeProposal',
        )
        const proposalId = parseProposalId(req.params.id)
        const txHash = await execute(proposalId)
        logger.info('Governance proposal executed', {
          requestId: req.requestId,
          userId: req.user?.id,
          proposalId,
          txHash,
        })
        res.json({ success: true, txHash })
      } catch (error) {
        next(mapGovernanceError(error))
      }
    },
  )

  return router
}
