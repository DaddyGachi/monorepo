import { describe, expect, it } from 'vitest'
import { isDealEscrowContractError, isDuplicateReceiptError, isTransientRpcError } from './errors.js'

describe('isDealEscrowContractError', () => {
  it('matches on the numeric discriminant (#<code>)', () => {
    expect(isDealEscrowContractError(new Error('HostError: Error(Contract, #18)'), 'DisputeNotAllowed')).toBe(
      true,
    )
  })

  it('matches on the variant name appearing in the message', () => {
    expect(isDealEscrowContractError(new Error('contract call failed: NoPendingRelease'), 'NoPendingRelease')).toBe(
      true,
    )
  })

  it('does not match a different variant', () => {
    expect(isDealEscrowContractError(new Error('Error(Contract, #17)'), 'DisputeNotAllowed')).toBe(false)
  })

  it('follows the .cause chain', () => {
    const inner = new Error('Error(Contract, #19)')
    const outer = new Error('Admin operation failed', { cause: inner })
    expect(isDealEscrowContractError(outer, 'NoOpenDispute')).toBe(true)
  })

  it('returns false for non-error values', () => {
    expect(isDealEscrowContractError(undefined, 'DisputeNotAllowed')).toBe(false)
    expect(isDealEscrowContractError('plain string', 'DisputeNotAllowed')).toBe(false)
  })

  it('does not infinite-loop on a self-referential cause chain', () => {
    const err = new Error('loop') as Error & { cause?: unknown }
    err.cause = err
    expect(isDealEscrowContractError(err, 'DisputeNotAllowed')).toBe(false)
  })
})

// Sanity check the existing helpers are untouched by the new export.
describe('existing error helpers', () => {
  it('isDuplicateReceiptError still works', () => {
    expect(isDuplicateReceiptError(new Error('already recorded'))).toBe(true)
  })

  it('isTransientRpcError still works', () => {
    expect(isTransientRpcError(new Error('request timeout'))).toBe(true)
  })
})
