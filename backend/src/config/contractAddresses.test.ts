import { describe, expect, it } from 'vitest'
import { StrKey } from '@stellar/stellar-sdk'
import {
  CONTRACT_ENV_VARS,
  loadContractAddresses,
} from './contractAddresses.js'

const VALID_CONTRACT_ID =
  'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM'

describe('contract address config', () => {
  it('loads valid addresses into a typed object and records unset entries', () => {
    expect(StrKey.isValidContract(VALID_CONTRACT_ID)).toBe(true)
    const addresses = loadContractAddresses({
      SOROBAN_DEAL_ESCROW_ID: VALID_CONTRACT_ID,
    })

    expect(addresses.dealEscrow).toBe(VALID_CONTRACT_ID)
    expect(addresses.rentPayments).toBeUndefined()
    expect(Object.keys(addresses)).toEqual(Object.keys(CONTRACT_ENV_VARS))
  })

  it('recognizes SOROBAN_ORACLE_PRICE_FEEDS_ID (issue #1488)', () => {
    expect(CONTRACT_ENV_VARS.oraclePriceFeeds).toBe('SOROBAN_ORACLE_PRICE_FEEDS_ID')

    const addresses = loadContractAddresses({
      SOROBAN_ORACLE_PRICE_FEEDS_ID: VALID_CONTRACT_ID,
    })
    expect(addresses.oraclePriceFeeds).toBe(VALID_CONTRACT_ID)

    expect(() =>
      loadContractAddresses({ SOROBAN_ORACLE_PRICE_FEEDS_ID: 'not-a-contract' }),
    ).toThrow('Invalid Soroban contract ID in SOROBAN_ORACLE_PRICE_FEEDS_ID')
  })

  it('recognizes SOROBAN_MVP_STAKING_POOL_ID (issue #1493)', () => {
    expect(CONTRACT_ENV_VARS.mvpStakingPool).toBe('SOROBAN_MVP_STAKING_POOL_ID')

    const addresses = loadContractAddresses({
      SOROBAN_MVP_STAKING_POOL_ID: VALID_CONTRACT_ID,
    })
    expect(addresses.mvpStakingPool).toBe(VALID_CONTRACT_ID)
  })

  it('recognizes SOROBAN_STAKE_DELEGATION_ID (issue #1489)', () => {
    expect(CONTRACT_ENV_VARS.stakeDelegation).toBe('SOROBAN_STAKE_DELEGATION_ID')

    const addresses = loadContractAddresses({
      SOROBAN_STAKE_DELEGATION_ID: VALID_CONTRACT_ID,
    })
    expect(addresses.stakeDelegation).toBe(VALID_CONTRACT_ID)

    expect(() =>
      loadContractAddresses({ SOROBAN_STAKE_DELEGATION_ID: 'not-a-contract' }),
    ).toThrow('Invalid Soroban contract ID in SOROBAN_STAKE_DELEGATION_ID')
  })

  it('recognizes SOROBAN_GOVERNANCE_ID as distinct from SOROBAN_TIMELOCK_ID (issue #1494)', () => {
    expect(CONTRACT_ENV_VARS.governance).toBe('SOROBAN_GOVERNANCE_ID')
    expect(CONTRACT_ENV_VARS.governance).not.toBe(CONTRACT_ENV_VARS.timelock)

    const addresses = loadContractAddresses({
      SOROBAN_GOVERNANCE_ID: VALID_CONTRACT_ID,
    })
    expect(addresses.governance).toBe(VALID_CONTRACT_ID)
    // The timelock contract is a separate deployment; setting one must not set the other.
    expect(addresses.timelock).toBeUndefined()

    expect(() =>
      loadContractAddresses({ SOROBAN_GOVERNANCE_ID: 'not-a-contract' }),
    ).toThrow('Invalid Soroban contract ID in SOROBAN_GOVERNANCE_ID')
  })

  it('fails fast with the offending environment variable', () => {
    expect(() =>
      loadContractAddresses({
        SOROBAN_TENANT_REPUTATION_ID: 'not-a-contract',
      }),
    ).toThrow(
      'Invalid Soroban contract ID in SOROBAN_TENANT_REPUTATION_ID',
    )
  })
})

