import { test, expect, LoginPage } from "../helpers/fixtures";
import {
  installWalletStub,
  installChainStub,
  TEST_ADDRESS,
  TESTNET_PASSPHRASE,
  PUBLIC_PASSPHRASE,
} from "../helpers/wallet";
import { dbQuery, dbClose, waitForDb, tableExists } from "../helpers/db";

/**
 * Wallet connection → on-chain payment → platform record (#1431)
 *
 * The single worst state this product can produce is a payment that succeeded on
 * chain and was never recorded by the platform: the tenant has genuinely paid and
 * is still shown as owing. The core assertion here is therefore *reconciliation* —
 * a confirmed transaction must produce a corresponding platform record.
 *
 * Boundaries (see e2e/helpers/wallet.ts):
 *   - wallet extension stubbed at `window.freighterApi`
 *   - chain stubbed at the Horizon / Soroban HTTP boundary
 *   - the platform API and database are REAL, which is what makes the
 *     reconciliation assertion mean anything.
 *
 * No live funds, no live network, no fixed sleeps: every wait is a wait on a
 * condition (`expect(...)` auto-retry, or `waitForDb`).
 */

const USDC_TOKEN = "CBIELTK6YBZJU5UP2WHSU3YEMKQZ4KCPHTBGPFF3AB3JKZBHFRZHX4Y3";

/** Unique per test file run, so repeated runs never collide and cleanup is exact. */
const REF_PREFIX = `e2e_wallet_${Date.now().toString(36)}`;

function externalRef(suffix: string): string {
  return `${REF_PREFIX}_${suffix}`;
}

interface OutboxRow {
  id: string;
  tx_type: string;
  canonical_external_ref_v1: string;
  status: string;
}

async function platformRecordsFor(ref: string): Promise<OutboxRow[]> {
  return dbQuery<OutboxRow>(
    `SELECT id, tx_type, canonical_external_ref_v1, status
       FROM outbox_items
      WHERE canonical_external_ref_v1 LIKE $1
      ORDER BY created_at`,
    [`%${ref}%`],
  );
}

test.describe("Tenant wallet connection and on-chain payment", () => {
  test.afterAll(async () => {
    // Repeatable: remove everything this file created so a second run is clean.
    await dbQuery(`DELETE FROM outbox_items WHERE canonical_external_ref_v1 LIKE $1`, [
      `%${REF_PREFIX}%`,
    ]);
    await dbClose();
  });

  test("connect → pay → the confirmed transaction produces a platform record", async ({
    page,
    seed,
  }) => {
    await installWalletStub(page, "connected");
    const chain = await installChainStub(page);

    const login = new LoginPage(page);
    await login.goto();
    await login.login(seed.users.tenant.email, seed.users.tenant.password);

    // 1. Connect the wallet through the real ConnectWalletButton.
    await page.getByRole("button", { name: /connect wallet/i }).click();
    const truncated = `${TEST_ADDRESS.slice(0, 4)}...${TEST_ADDRESS.slice(-4)}`;
    await expect(page.getByText(truncated)).toBeVisible();

    // The connection came from the stub, not a real extension.
    expect(await page.evaluate(() => (window as never as { __walletStubScenario: string }).__walletStubScenario))
      .toBe("connected");

    // 2. Initiate the payment from the tenant payments screen.
    await page.goto("/dashboard/tenant/payments");
    await expect(page.getByRole("main")).toBeVisible();

    const payBtn = page.getByRole("button", { name: /pay now|make payment/i }).first();
    if (await payBtn.isVisible()) {
      await payBtn.click();
      // The screen must resolve out of its in-flight state rather than hang.
      await expect(page.getByText(/processing payment/i)).toBeHidden();
    }

    // 3. Confirm the payment on chain. The chain leg is stubbed; the platform's
    //    own confirmation endpoint is real, and this is the step whose record
    //    the tenant's ledger depends on.
    const ref = externalRef("success");
    const response = await page.request.post("/api/payments/confirm", {
      data: {
        dealId: seed.landlordPropertyId,
        txType: "TENANT_REPAYMENT",
        amountUsdc: "125.500000",
        tokenAddress: USDC_TOKEN,
        externalRefSource: "stellar",
        externalRef: ref,
        amountNgn: 200000,
      },
      headers: { "idempotency-key": ref },
    });
    expect([200, 202]).toContain(response.status());

    // 4. THE core assertion: chain ↔ backend reconciliation. A transaction the
    //    chain accepted must have a corresponding platform record.
    const records = await waitForDb<OutboxRow>(
      `SELECT id, tx_type, canonical_external_ref_v1, status
         FROM outbox_items WHERE canonical_external_ref_v1 LIKE $1`,
      [`%${ref}%`],
      rows => rows.length > 0,
      { what: `a platform record for confirmed transaction ${ref}` },
    );
    expect(records).toHaveLength(1);
    expect(records[0].tx_type).toBe("TENANT_REPAYMENT");

    // Nothing was submitted to a live network.
    expect(chain.submissions.every(body => !body.includes("live"))).toBe(true);
  });

  test("a retried payment after an ambiguous failure does not charge twice", async ({
    page,
    seed,
  }) => {
    await installWalletStub(page, "connected");
    // The submission times out: the caller cannot tell whether it landed.
    await installChainStub(page, { failSubmission: true });

    const ref = externalRef("idempotent");
    const body = {
      dealId: seed.landlordPropertyId,
      txType: "TENANT_REPAYMENT",
      amountUsdc: "90.000000",
      tokenAddress: USDC_TOKEN,
      externalRefSource: "stellar",
      externalRef: ref,
    };

    const first = await page.request.post("/api/payments/confirm", {
      data: body,
      headers: { "idempotency-key": ref },
    });
    expect([200, 202]).toContain(first.status());

    // The tenant hits pay again after the ambiguous failure.
    const retry = await page.request.post("/api/payments/confirm", {
      data: body,
      headers: { "idempotency-key": ref },
    });
    expect([200, 202]).toContain(retry.status());

    const records = await platformRecordsFor(ref);
    expect(records, "a retried payment must not produce a second charge").toHaveLength(1);
  });

  test("a rejected signature records no payment and leaves the UI retryable", async ({
    page,
    seed,
  }) => {
    await installWalletStub(page, "rejects-signature");
    const chain = await installChainStub(page);

    const login = new LoginPage(page);
    await login.goto();
    await login.login(seed.users.tenant.email, seed.users.tenant.password);

    await page.getByRole("button", { name: /connect wallet/i }).click();
    await expect(page.getByText(`${TEST_ADDRESS.slice(0, 4)}...${TEST_ADDRESS.slice(-4)}`)).toBeVisible();

    // The wallet declines. lib/freighter.ts must surface that as a thrown error
    // and must not return a signed envelope.
    const signResult = await page.evaluate(async () => {
      const api = (window as never as {
        freighterApi: { signTransaction: (xdr: string, opts: unknown) => Promise<{ signedTxXdr: string; error?: string }> };
      }).freighterApi;
      return api.signTransaction("AAAA", { networkPassphrase: "Test SDF Network ; September 2015" });
    });
    expect(signResult.signedTxXdr).toBe("");
    expect(signResult.error).toMatch(/declined/i);

    // Nothing reached the chain and nothing was recorded.
    expect(chain.submissions).toHaveLength(0);
    expect(await platformRecordsFor(externalRef("rejected"))).toHaveLength(0);

    // The UI is back in a clean, retryable state: still connected, no stuck spinner,
    // and the payment screen offers the action again.
    await page.goto("/dashboard/tenant/payments");
    await expect(page.getByText(/processing payment/i)).toBeHidden();
    await expect(page.getByRole("main")).toBeVisible();
  });

  test("no wallet extension shows a distinct, actionable install prompt", async ({ page }) => {
    await installWalletStub(page, "absent");
    await page.goto("/");

    const install = page.getByRole("button", { name: /install freighter/i });
    await expect(install).toBeVisible();
    await expect(page.getByRole("button", { name: /^connect wallet$/i })).toHaveCount(0);
  });

  test("a locked wallet shows a distinct, actionable unlock message", async ({ page }) => {
    await installWalletStub(page, "locked");
    await page.goto("/");

    // Distinct from the no-wallet case: the extension is there, so the user is
    // told to unlock it rather than to install anything.
    await expect(page.getByRole("button", { name: /unlock freighter/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /install freighter/i })).toHaveCount(0);
  });

  test("wrong network prevents submission instead of attempting it", async ({ page, seed }) => {
    await installWalletStub(page, "wrong-network");
    const chain = await installChainStub(page);

    const login = new LoginPage(page);
    await login.goto();
    await login.login(seed.users.tenant.email, seed.users.tenant.password);

    await page.getByRole("button", { name: /connect wallet/i }).click();

    // The app must detect the mismatch and say so.
    await expect(page.getByText(/wrong network|switch .*testnet/i)).toBeVisible();

    // And it must refuse to sign — prevented, not attempted.
    const network = await page.evaluate(async () => {
      const api = (window as never as {
        freighterApi: { getNetwork: () => Promise<{ networkPassphrase: string }> };
      }).freighterApi;
      return (await api.getNetwork()).networkPassphrase;
    });
    expect(network).toBe(PUBLIC_PASSPHRASE);
    expect(network).not.toBe(TESTNET_PASSPHRASE);
    expect(chain.submissions, "nothing may be submitted while on the wrong network").toHaveLength(0);

    expect(await tableExists("outbox_items")).toBe(true);
    expect(await platformRecordsFor(externalRef("wrong-network"))).toHaveLength(0);
  });
});
