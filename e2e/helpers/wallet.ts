import type { Page, Route } from "@playwright/test";

/**
 * Wallet + chain stubs (#1431)
 *
 * Stable boundary, chosen deliberately:
 *
 *  - The **extension** is stubbed at `window.freighterApi`, the object
 *    `@stellar/freighter-api` talks to. Everything above it — lib/freighter.ts,
 *    contexts/WalletContext, ConnectWalletButton — is the real application code
 *    under test.
 *  - The **chain** is stubbed at the HTTP boundary (Horizon / Soroban RPC), so
 *    the spec never needs live funds, a live network, or a funded testnet
 *    account, and never becomes flaky because testnet is slow.
 *
 * Nothing else is faked: the platform's own API and database stay real, which is
 * what makes the chain↔backend reconciliation assertion meaningful.
 */

export const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";
export const PUBLIC_PASSPHRASE = "Public Global Stellar Network ; September 2015";

export const TEST_ADDRESS = "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H";

export type WalletScenario =
  /** Extension present, unlocked, on Testnet, signs when asked. */
  | "connected"
  /** No extension installed at all. */
  | "absent"
  /** Extension installed but locked — no address available. */
  | "locked"
  /** Unlocked, but Freighter is pointed at a different network. */
  | "wrong-network"
  /** Unlocked, on the right network, but the user rejects the signature. */
  | "rejects-signature";

/**
 * Install the stub. Must be called before the first navigation so it is in place
 * for the app's initial `isConnected()` probe.
 */
export async function installWalletStub(page: Page, scenario: WalletScenario): Promise<void> {
  await page.addInitScript(
    ({ scenario, address, testnet, publicnet }) => {
      if (scenario === "absent") {
        // Leave window.freighterApi undefined — the same shape as no extension.
        return;
      }

      const locked = scenario === "locked";
      const passphrase = scenario === "wrong-network" ? publicnet : testnet;

      const api = {
        isConnected: async () => ({ isConnected: true }),
        // A locked wallet is one the site is still allowed to use — it simply
        // cannot produce an address until the user unlocks it. That is what
        // makes "locked" distinguishable from "never connected".
        isAllowed: async () => ({ isAllowed: true }),
        setAllowed: async () => ({ isAllowed: true }),
        requestAccess: async () =>
          locked
            ? { address: "", error: "Wallet is locked" }
            : { address },
        getAddress: async () =>
          locked ? { address: "", error: "Wallet is locked" } : { address },
        getPublicKey: async () => {
          if (locked) throw new Error("Wallet is locked");
          return address;
        },
        getNetwork: async () => ({
          network: passphrase === testnet ? "TESTNET" : "PUBLIC",
          networkPassphrase: passphrase,
          networkUrl: "https://stubbed.invalid",
        }),
        getNetworkDetails: async () => ({
          network: passphrase === testnet ? "TESTNET" : "PUBLIC",
          networkPassphrase: passphrase,
          networkUrl: "https://stubbed.invalid",
        }),
        signTransaction: async (xdr: string) => {
          if (scenario === "rejects-signature") {
            // Freighter's shape for a user-declined signature.
            return { signedTxXdr: "", error: "User declined access" };
          }
          if (locked) return { signedTxXdr: "", error: "Wallet is locked" };
          return { signedTxXdr: `${xdr}:signed-by-stub`, signerAddress: address };
        },
        signAuthEntry: async () => ({ signedAuthEntry: "stub", signerAddress: address }),
        signMessage: async () => ({ signedMessage: "stub", signerAddress: address }),
        WatchWalletChanges: class {
          watch() {}
          stop() {}
        },
      };

      (window as unknown as Record<string, unknown>).freighterApi = api;
      (window as unknown as Record<string, unknown>).freighter = true;
      // Marker the spec can assert on to prove the stub, not a real extension, is in play.
      (window as unknown as Record<string, unknown>).__walletStubScenario = scenario;
    },
    {
      scenario,
      address: TEST_ADDRESS,
      testnet: TESTNET_PASSPHRASE,
      publicnet: PUBLIC_PASSPHRASE,
    },
  );
}

/** Chain submissions observed by the stub, in order. */
export interface ChainStub {
  submissions: string[];
  /** Deterministic hash the stubbed chain "confirms" a submission with. */
  txHash: string;
}

/**
 * Intercept Horizon / Soroban RPC traffic. Submissions are recorded and answered
 * with a confirmed result, so a spec can assert on what was submitted without a
 * live network.
 */
export async function installChainStub(
  page: Page,
  opts: { txHash?: string; failSubmission?: boolean } = {},
): Promise<ChainStub> {
  const stub: ChainStub = {
    submissions: [],
    txHash: opts.txHash ?? `e2e${"0".repeat(58)}`.slice(0, 64),
  };

  const handle = async (route: Route) => {
    const request = route.request();
    const body = request.postData() ?? "";

    if (request.method() === "POST") {
      stub.submissions.push(body);
      if (opts.failSubmission) {
        await route.fulfill({
          status: 504,
          contentType: "application/json",
          body: JSON.stringify({ title: "Timeout", status: 504 }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          hash: stub.txHash,
          successful: true,
          status: "SUCCESS",
          ledger: 1,
          result_xdr: "AAAAAAAAAGQAAAAAAAAAAA==",
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "SUCCESS", hash: stub.txHash, sequence: "1" }),
    });
  };

  for (const pattern of [
    "**/horizon*.stellar.org/**",
    "**/soroban*.stellar.org/**",
    "**/*.stellar.org/transactions**",
    "**/friendbot**",
  ]) {
    await page.route(pattern, handle);
  }

  return stub;
}
