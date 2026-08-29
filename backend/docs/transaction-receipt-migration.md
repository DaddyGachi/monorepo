# Transaction Receipt Migration

## Overview

This document describes the migration of transaction receipt recording and reading from the generic core contract to the dedicated `transaction-receipt-contract`.

## Migration Strategy

### Write Path (Recording Receipts)

The `recordReceipt` method in `real-adapter.ts` now supports a migration window:

- **When `SOROBAN_TRANSACTION_RECEIPT_ID` is configured**: Receipts are recorded to the dedicated `transaction-receipt-contract` using the new `ReceiptInput` structure (with `external_ref_source` and `external_ref` fields).
- **When `SOROBAN_TRANSACTION_RECEIPT_ID` is NOT configured**: Receipts fall back to the legacy core contract using the old parameter structure (with `tx_id` passed directly).

This allows for a gradual migration where:
1. Deploy the `transaction-receipt-contract` and set `SOROBAN_TRANSACTION_RECEIPT_ID`
2. New receipts are automatically recorded to the new contract
3. The legacy core contract remains functional for backward compatibility

### Read Path (Querying Receipts)

The read path has been enhanced with direct query methods:

- `getReceiptById(txId)`: Direct lookup by transaction ID
- `listReceiptsByDeal(dealId, limit, cursor)`: Paginated list of receipts for a specific deal
- `listReceiptsByUser(userAddress, limit, cursor)`: Paginated list of receipts for a specific user

These methods query the `transaction-receipt-contract` directly when `SOROBAN_TRANSACTION_RECEIPT_ID` is configured.

The legacy `getReceiptEvents` method continues to work for:
- Event scanning from the core contract (when `SOROBAN_TRANSACTION_RECEIPT_ID` is not configured)
- Event scanning from the transaction-receipt-contract (when `SOROBAN_TRANSACTION_RECEIPT_ID` is configured)
- Near-real-time updates in the indexer

## Historical Data Handling

### Pre-Migration Receipts

Receipts recorded before the migration (on the core contract) remain in the core contract. They are **not** automatically migrated to the new contract.

### Accessing Historical Receipts

There are two approaches for accessing historical receipt data:

#### Option 1: Dual-Reading (Recommended for Transition Period)

During the transition period, the system can read from both contracts:

```typescript
// For a given deal, query both sources
const legacyReceipts = await adapter.getReceiptEvents(fromLedger) // Scans core contract
const newReceipts = await adapter.listReceiptsByDeal(dealId, limit, cursor) // Queries transaction-receipt-contract
const allReceipts = [...legacyReceipts, ...newReceipts]
```

This approach ensures no receipt history is lost during the migration window.

#### Option 2: Forward-Only Cutover

After a cutover point, the system can:
1. Stop recording to the core contract (by setting `SOROBAN_TRANSACTION_RECEIPT_ID`)
2. Continue using `getReceiptEvents` for historical data from the core contract
3. Use direct queries (`listReceiptsByDeal`, `listReceiptsByUser`) for new receipts

This approach is simpler but requires maintaining awareness of the cutover point.

### Recommended Approach

**For the initial migration**: Use Option 1 (Dual-Reading) to ensure continuity.

**After stabilization**: Consider Option 2 (Forward-Only Cutover) once:
- All active deals have been migrated to the new contract
- Historical receipt queries are rare (e.g., only for reconciliation)
- The team is confident in the new contract's reliability

## Configuration

### Environment Variables

Add the following to your environment configuration:

```bash
# New: Dedicated transaction receipt contract
SOROBAN_TRANSACTION_RECEIPT_ID=CTRX...

# Legacy: Generic core contract (still used for other operations)
SOROBAN_CONTRACT_ID=CCORE...
```

### Migration Steps

1. **Deploy the transaction-receipt-contract** (if not already deployed)
2. **Set `SOROBAN_TRANSACTION_RECEIPT_ID`** in your environment
3. **Verify new receipts are recorded correctly** using the backend tests
4. **Update read paths** to use direct query methods where appropriate
5. **Monitor** for any issues with receipt recording or querying
6. **Decide on historical data handling** based on your use case

## Testing

The migration includes backend tests to verify:

- `recordReceipt` uses `transactionReceiptId` when configured
- `recordReceipt` falls back to `contractId` when `transactionReceiptId` is not configured
- The correct contract ID is targeted in both cases

Run tests with:
```bash
cd backend
npm test
```

## Contract Tests

The `transaction-receipt-contract` has its own test suite. Run with:
```bash
cd contracts
cargo test -p transaction-receipt-contract
```

## Rollback

If issues arise, rollback is simple:

1. Unset `SOROBAN_TRANSACTION_RECEIPT_ID`
2. The system will automatically fall back to the core contract
3. No data loss occurs (receipts recorded to the new contract remain accessible)

## Future Work

- Consider migrating historical receipts from the core contract to the transaction-receipt-contract
- Evaluate whether event scanning can be fully replaced with direct queries
- Add monitoring for receipt recording failures across both contracts
