# Soroban and indexer resilience test report

## CI-safe deterministic coverage

The following adapter failure modes are covered by `src/soroban/real-adapter.resilience.test.ts`:

- RPC endpoint unavailable (`ECONNREFUSED`)
- RPC request timeout
- RPC error response
- Verification that a failed read does not produce a fabricated balance

The tests stub the Stellar RPC server and do not require credentials, deployed contracts, or network access.

## Suites excluded from `test:ci`

The network-dependent Soroban integration suite is `src/soroban/real-adapter.integration.test.ts`. It requires a live Soroban endpoint, deployed testnet contracts, funded accounts, and an admin signing key. Its configuration, connectivity, receipt, duplicate-receipt, and balance checks can be made deterministic with RPC and contract stubs; only deployed-contract and live-network checks genuinely require a network.

The deterministic adapter behavior belongs in unit tests and should not be excluded from CI. Live integration checks remain useful as separately invoked testnet verification, but are not suitable as a required unit-test gate.

## Indexer coverage inventory

The existing indexer unit suites cover event parsing, repository behavior, bootstrap setup, worker behavior, and timelock processing. They do not, based on the proposed edits, establish all of the resilience requirements from the issue:

- A restart test must prove that the persisted cursor/checkpoint is used as the next query's starting ledger.
- A gap test must prove that processing resumes from the last committed cursor rather than the latest ledger.
- Idempotency must be asserted by replaying the same event and verifying that it produces one effective state change.

Replaying the last successfully committed range is intentional only if repository uniqueness and idempotent processing are explicitly tested.

## Submitted but unconfirmed transactions

A submission accepted by the RPC node but not yet confirmed is inherently indeterminate. It must not be recorded as either a confirmed success or a definite failure. Retry logic must reuse the original transaction identity, and confirmation must be resolved by querying the chain.

The proposed edits do not add a test for this behavior, do not prove that retries cannot submit twice, and do not identify an existing adapter/outbox API that exposes or persists an indeterminate state. A stubbed `sendTransaction` followed by `getTransaction` responses is required before this acceptance criterion can be considered covered.

## Reorg and rollback

Soroban application finality is ledger-based, but an RPC consumer can still observe stale data, cursor gaps, or a rollback before it establishes the required finality boundary. The proposed edits do not add a reorg or rollback test. If rollback support is not applicable, the implementation must document the finality assumption and the behavior when a stale or inconsistent ledger is observed.
