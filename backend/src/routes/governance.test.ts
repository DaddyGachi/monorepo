import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import { createGovernanceRouter } from './governance.js'
import { InMemoryLinkedAddressStore } from '../models/linkedAddressStore.js'
import { errorHandler } from '../middleware/errorHandler.js'
import { requestIdMiddleware } from '../middleware/requestId.js'
import type { SorobanAdapter, GovernanceProposal } from '../soroban/adapter.js'

vi.mock('../middleware/auth.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../middleware/auth.js')>()
  return {
    ...original,
    authenticateToken: (req: any, _res: any, next: any) => next(),
  }
})

const USER_ID = 'governance-test-user-001'
const VOTER_ADDRESS = 'GVOTERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAK5X'

function sampleProposal(overrides: Partial<GovernanceProposal> = {}): GovernanceProposal {
  return {
    id: 1,
    proposer: VOTER_ADDRESS,
    paramKey: 'min_stake',
    currentValue: '100',
    proposedValue: '200',
    votesFor: '600000',
    votesAgainst: '200000',
    status: 'Active',
    createdAt: 1_700_000_000,
    votingEndsAt: 1_700_604_800,
    snapshottedTotalStaked: '1000000',
    ...overrides,
  }
}

function buildMockAdapter(overrides: Partial<SorobanAdapter> = {}): SorobanAdapter {
  return {
    getBalance: vi.fn(),
    credit: vi.fn(),
    debit: vi.fn(),
    getStakedBalance: vi.fn(async () => 5_000_000n),
    getClaimableRewards: vi.fn(),
    recordReceipt: vi.fn(),
    getConfig: vi.fn(),
    getReceiptEvents: vi.fn(),
    getTimelockEvents: vi.fn(),
    executeTimelock: vi.fn(),
    cancelTimelock: vi.fn(),
    stakeBond: vi.fn(),
    unstakeBond: vi.fn(),
    isBonded: vi.fn(),
    getBond: vi.fn(),
    createProposal: vi.fn(async () => ({ xdr: 'unsigned-xdr-stub' })),
    vote: vi.fn(async () => ({ xdr: 'unsigned-vote-xdr-stub' })),
    submitGovernanceTransaction: vi.fn(async () => ({ txHash: 'tx-hash-stub' })),
    finalizeProposal: vi.fn(async () => 'finalize-tx-hash'),
    executeProposal: vi.fn(async () => 'execute-tx-hash'),
    getProposal: vi.fn(async () => sampleProposal()),
    getProposalCount: vi.fn(async () => 1),
    ...overrides,
  } as unknown as SorobanAdapter
}

function buildApp(adapter: SorobanAdapter, linkedAddressStore = new InMemoryLinkedAddressStore()) {
  const app = express()
  app.use(requestIdMiddleware)
  app.use(express.json())
  app.use((req: any, _res, next) => {
    req.user = { id: USER_ID, role: 'user' }
    next()
  })
  app.use('/api/v1/governance', createGovernanceRouter(adapter, linkedAddressStore))
  app.use(errorHandler)
  return app
}

describe('Governance API (issue #1494)', () => {
  let linkedAddressStore: InMemoryLinkedAddressStore

  beforeEach(async () => {
    linkedAddressStore = new InMemoryLinkedAddressStore()
    await linkedAddressStore.setLinkedAddress(USER_ID, VOTER_ADDRESS)
  })

  describe('GET /proposals', () => {
    it('lists proposals from 1..proposalCount', async () => {
      const adapter = buildMockAdapter({
        getProposalCount: vi.fn(async () => 2),
        getProposal: vi.fn(async (id: number) => sampleProposal({ id })),
      })
      const res = await request(buildApp(adapter, linkedAddressStore))
        .get('/api/v1/governance/proposals')
        .expect(200)

      expect(res.body.success).toBe(true)
      expect(res.body.count).toBe(2)
      expect(res.body.proposals).toHaveLength(2)
      expect(res.body.proposals.map((p: GovernanceProposal) => p.id)).toEqual([1, 2])
    })
  })

  describe('GET /proposals/:id', () => {
    it('returns 404 when the proposal does not exist', async () => {
      const adapter = buildMockAdapter({ getProposal: vi.fn(async () => null) })
      const res = await request(buildApp(adapter, linkedAddressStore))
        .get('/api/v1/governance/proposals/999')
        .expect(404)

      expect(res.body.error.code).toBe('NOT_FOUND')
    })
  })

  describe('POST /proposals/prepare', () => {
    it('rejects with 403 when the caller has no linked Stellar address', async () => {
      const adapter = buildMockAdapter()
      const res = await request(buildApp(adapter, new InMemoryLinkedAddressStore()))
        .post('/api/v1/governance/proposals/prepare')
        .send({ paramKey: 'min_stake', currentValue: '100', proposedValue: '200' })
        .expect(400)

      expect(res.body.error.message).toMatch(/linked wallet/i)
      expect(adapter.createProposal).not.toHaveBeenCalled()
    })

    it('rejects with 403 when staked balance is below MIN_STAKE_TO_PROPOSE (issue #1494 acceptance criteria)', async () => {
      const adapter = buildMockAdapter({ getStakedBalance: vi.fn(async () => 0n) })
      const res = await request(buildApp(adapter, linkedAddressStore))
        .post('/api/v1/governance/proposals/prepare')
        .send({ paramKey: 'min_stake', currentValue: '100', proposedValue: '200' })
        .expect(403)

      expect(res.body.error.details?.stakedBalance).toBe('0')
      expect(adapter.createProposal).not.toHaveBeenCalled()
    })

    it('prepares an unsigned create_proposal envelope for a sufficiently staked caller', async () => {
      const adapter = buildMockAdapter({ getStakedBalance: vi.fn(async () => 5_000_000n) })
      const res = await request(buildApp(adapter, linkedAddressStore))
        .post('/api/v1/governance/proposals/prepare')
        .send({ paramKey: 'min_stake', currentValue: '100', proposedValue: '200' })
        .expect(200)

      expect(res.body.success).toBe(true)
      expect(res.body.xdr).toBe('unsigned-xdr-stub')
      expect(adapter.createProposal).toHaveBeenCalledWith({
        proposer: VOTER_ADDRESS,
        paramKey: 'min_stake',
        currentValue: 100n,
        proposedValue: 200n,
      })
    })

    it('rejects an invalid paramKey with 400', async () => {
      const adapter = buildMockAdapter()
      await request(buildApp(adapter, linkedAddressStore))
        .post('/api/v1/governance/proposals/prepare')
        .send({ paramKey: 'not a symbol!', currentValue: '100', proposedValue: '200' })
        .expect(400)

      expect(adapter.createProposal).not.toHaveBeenCalled()
    })
  })

  describe('POST /proposals/submit', () => {
    it('broadcasts a signed envelope', async () => {
      const adapter = buildMockAdapter()
      const res = await request(buildApp(adapter, linkedAddressStore))
        .post('/api/v1/governance/proposals/submit')
        .send({ signedXdr: 'signed-envelope' })
        .expect(200)

      expect(res.body.txHash).toBe('tx-hash-stub')
      expect(adapter.submitGovernanceTransaction).toHaveBeenCalledWith('signed-envelope')
    })
  })

  describe('POST /proposals/:id/vote/prepare', () => {
    it('passes the resolved voter address through untouched — weight-matching is a contract-level guarantee', async () => {
      const adapter = buildMockAdapter()
      const res = await request(buildApp(adapter, linkedAddressStore))
        .post('/api/v1/governance/proposals/1/vote/prepare')
        .send({ support: true })
        .expect(200)

      expect(res.body.xdr).toBe('unsigned-vote-xdr-stub')
      expect(adapter.vote).toHaveBeenCalledWith({
        voter: VOTER_ADDRESS,
        proposalId: 1,
        support: true,
      })
    })
  })

  describe('POST /proposals/:id/finalize', () => {
    it('surfaces a 409 when the contract rejects because voting has not ended yet', async () => {
      const adapter = buildMockAdapter({
        finalizeProposal: vi.fn(async () => {
          throw new Error('VotingNotEnded: voting period has not ended')
        }),
      })
      const res = await request(buildApp(adapter, linkedAddressStore))
        .post('/api/v1/governance/proposals/1/finalize')
        .expect(409)

      expect(res.body.error.message).toMatch(/voting period has not ended/i)
    })

    it('finalizes successfully once the adapter allows it', async () => {
      const adapter = buildMockAdapter()
      const res = await request(buildApp(adapter, linkedAddressStore))
        .post('/api/v1/governance/proposals/1/finalize')
        .expect(200)

      expect(res.body.txHash).toBe('finalize-tx-hash')
    })
  })

  describe('POST /proposals/:id/execute', () => {
    it('surfaces a 409 when the contract rejects because the timelock has not elapsed', async () => {
      const adapter = buildMockAdapter({
        executeProposal: vi.fn(async () => {
          throw new Error('TimelockNotElapsed: execution timelock has not elapsed yet')
        }),
      })
      const res = await request(buildApp(adapter, linkedAddressStore))
        .post('/api/v1/governance/proposals/1/execute')
        .expect(409)

      expect(res.body.error.message).toMatch(/timelock has not elapsed/i)
    })

    it('executes successfully once the adapter allows it', async () => {
      const adapter = buildMockAdapter()
      const res = await request(buildApp(adapter, linkedAddressStore))
        .post('/api/v1/governance/proposals/1/execute')
        .expect(200)

      expect(res.body.txHash).toBe('execute-tx-hash')
    })
  })

  describe('capability gating', () => {
    it('returns 503 when the configured adapter does not implement a governance method', async () => {
      const adapter = buildMockAdapter({ createProposal: undefined })
      const res = await request(buildApp(adapter, linkedAddressStore))
        .post('/api/v1/governance/proposals/prepare')
        .send({ paramKey: 'min_stake', currentValue: '100', proposedValue: '200' })
        .expect(503)

      expect(res.body.error.message).toMatch(/createProposal/)
    })
  })
})
