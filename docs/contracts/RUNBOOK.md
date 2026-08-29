# Contract Deployment & Upgrade Runbook

**Status:** documentation only. This runbook describes the procedure using the
scripts and contracts that already exist — it does not introduce or change any
of them.

The repository already documents the *pieces*:

| Document                                              | Covers                                        |
| ----------------------------------------------------- | --------------------------------------------- |
| [`DEPLOYMENT.md`](./DEPLOYMENT.md)                     | Soroban CLI commands, identities, backend env  |
| [`UPGRADE_PROCESS.md`](./UPGRADE_PROCESS.md)           | Who may upgrade, PR governance                 |
| [`../../contracts/deployment/README.md`](../../contracts/deployment/README.md) | Multi-network config and the idempotent deploy script |

This file is the **ordered procedure** that ties them together. A deployment is
performed rarely and cannot be undone, which is exactly the combination in which
a step gets skipped. Follow the steps in order and do not skip Step 3.

---

## 0. The testnet/mainnet gate

There is one gate, and it is not automated:

> **Every contract ships to testnet first. Mainnet deployment is a maintainer
> action, never a contributor action.**

| | Testnet | Mainnet |
| --- | --- | --- |
| Who runs it | Any contributor | Maintainers only |
| Config | `contracts/deployment/config/testnet.json` | `contracts/deployment/config/mainnet.json` |
| Network passphrase | `Test SDF Network ; September 2015` | `Public Global Stellar Network ; September 2015` |
| Funding | Friendbot | Real XLM |
| Admin authority | May be a single deployer key while iterating | **Must** be the multisig before the contract holds value |
| Prerequisite | none | A testnet deployment of the *same WASM hash*, exercised and reviewed |

Contributor PRs describing a deployment should tick **Testnet** in the PR
template. If you believe a mainnet deployment is warranted, say so in the PR and
stop — do not deploy.

---

## 1. Deploying a new contract

### Step 1 — Build from a clean tree

```bash
cd contracts
git status --porcelain          # must be empty; you cannot verify a dirty build
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features
cargo test --workspace
bash scripts/build-wasm.sh      # or: stellar contract build --out-dir contracts/artifacts
```

Record the commit SHA you built from. Every later step refers back to it.

### Step 2 — Record the WASM hash *before* deploying

```bash
sha256sum contracts/artifacts/<contract>.wasm
```

Write this value down now. Computing it after deployment defeats the point of
the check in Step 3 — you would be comparing the deployed artifact against
itself.

### Step 3 — Deploy

```bash
export STELLAR_SECRET_KEY="S..."
export STELLAR_DEPLOYER_ADDRESS="G..."

stellar contract deploy \
  --wasm contracts/artifacts/<contract>.wasm \
  --source-account shelter_admin \
  --network testnet
```

Or, for the full suite, the idempotent script — it skips anything already
recorded in `deployed/{network}.json`:

```bash
bash contracts/deployment/scripts/deploy-soroban.sh --network testnet
```

Record the returned contract ID (`C...`) and the deploy transaction hash.

### Step 4 — Verify the deployed WASM matches what you built

**This is the step most often skipped and the one that matters most.** See
[§3 Verification](#3-verification--proving-the-deployment-is-what-you-reviewed).
Do it before initializing, not after.

### Step 5 — Initialize

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" --source-account shelter_admin --network testnet --send=yes \
  -- init --admin "$ADMIN_ADDR" ...
```

Initialization is normally **single-shot** — a second `init` fails with
`already initialized`. If you initialize with the wrong admin address, the
contract is not recoverable by re-initializing; deploy a fresh instance.

For per-contract `init` signatures see [`DEPLOYMENT.md`](./DEPLOYMENT.md).

### Step 6 — Transfer admin authority to the multisig

A contract that will hold user funds must not remain under a single deployer
key. Hand the admin role to the `multisig_admin` contract (or a Stellar multisig
account, per [`UPGRADE_PROCESS.md`](./UPGRADE_PROCESS.md)):

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" --source-account shelter_admin --network testnet --send=yes \
  -- set_admin --new_admin "$MULTISIG_ADDR"
```

Then **confirm the transfer landed** by reading the admin back and by verifying
the old key can no longer perform an admin action:

```bash
stellar contract invoke --id "$CONTRACT_ID" --network testnet -- get_admin
```

If the read does not return the multisig address, stop. A contract you believe
is under multisig control but is not is worse than one you know is under a
single key.

### Step 7 — Record the deployment

Confirm the contract ID landed in `contracts/deployment/deployed/{network}.json`
(the deploy script writes it; a manual `stellar contract deploy` does not — add
the entry yourself). See [§5](#5-where-deployments-are-tracked).

---

## 2. Upgrading an existing contract

Contributors may **propose** an upgrade. Only maintainers holding multisig keys
may **execute** one.

1. **Build and hash the new WASM.** Steps 1–2 above, from a clean tree, on the
   commit under review.
2. **Deploy the new WASM to testnet** and exercise it against the existing test
   suite and the manual checklist. An upgrade proposal without a testnet run
   behind it is not reviewable.
3. **Install the WASM on the target network.** `stellar contract upload` returns
   the WASM hash the upgrade will point at. Verify it equals the hash from
   step 1.
4. **Open a PR** using `.github/PULL_REQUEST_TEMPLATE.md` and fill in
   *Contract Upgrade Details* completely — see [§6](#6-filling-in-the-pr-template)
   for where each value comes from.
5. **Maintainer proposes the upgrade through the multisig.** The proposal names
   the contract ID and the new WASM hash.
6. **The timelock delay elapses.** The `timelock` contract holds the proposal
   for a fixed waiting period (24–48h) before it becomes executable.

   The delay is not a formality and it is not there to catch bugs — tests do
   that. It exists so that **an upgrade nobody intended cannot land silently**.
   If a multisig key is compromised, or a proposal is mis-encoded, or a
   maintainer approves the wrong hash, the waiting period is the window in which
   somebody notices and cancels. It converts an instant, irreversible action
   into one with a review period.

   A proposal can be cancelled at any point *during* the delay. That is the last
   moment at which an upgrade is cheap to undo.
7. **Multisig executes** after the delay.
8. **Verify the upgrade** — re-run §3 against the live contract and confirm the
   deployed hash is the new one.

---

## 3. Verification — proving the deployment is what you reviewed

Deploying and verifying are different acts. A successful deploy transaction
proves *something* was installed; it does not prove it was the artifact that was
built, reviewed, and tested.

Fetch the WASM the network actually holds and hash it:

```bash
# 1. The hash you built (Step 2)
LOCAL_HASH=$(sha256sum contracts/artifacts/<contract>.wasm | cut -d' ' -f1)

# 2. The WASM the network is serving for that contract ID
stellar contract fetch --id "$CONTRACT_ID" --network testnet > /tmp/onchain.wasm
ONCHAIN_HASH=$(sha256sum /tmp/onchain.wasm | cut -d' ' -f1)

# 3. They must be identical
[ "$LOCAL_HASH" = "$ONCHAIN_HASH" ] && echo "MATCH" || echo "MISMATCH — STOP"
```

A mismatch means one of: you deployed a stale artifact, you built from a
different commit, or you are looking at the wrong contract ID. Do not
initialize, do not transfer admin, and do not proceed. Establish which of the
three it is first.

Also confirm, and state the result in the PR:

- [ ] Local WASM hash matches the on-chain WASM hash.
- [ ] The build came from a clean tree at a named commit SHA.
- [ ] `get_admin` returns the multisig address (for contracts holding value).
- [ ] `cargo test --workspace` passes at that commit.
- [ ] The deploy transaction is visible on the explorer for the intended network.

Reproducibility caveat, stated honestly: `stellar contract build` output can
differ across toolchain versions and build environments, so a hash computed on
another machine may not match yours even when the source is identical. Record
the Rust and `stellar` CLI versions alongside the hash so a reviewer can
reproduce the comparison rather than having to trust it.

---

## 4. Rollback — what can and cannot be undone

Be honest with yourself about this before you deploy, not after.

| Situation | Can it be undone? |
| --- | --- |
| Upgrade proposed, still inside the timelock delay | **Yes.** Cancel the proposal through the multisig. This is the only cheap reversal. |
| Upgrade executed, previous WASM still installed on-network | **Partially.** A *second* upgrade can point the contract back at the previous WASM hash — but it is a new upgrade and goes through the full multisig + timelock cycle again. |
| Upgrade executed and state migrated to a new layout | **No.** Reverting the code does not revert the storage. If a migration ran, the old WASM may not be able to read the current state at all. |
| Contract deployed with wrong `init` parameters | **No.** `init` is single-shot. Deploy a fresh instance and repoint whatever referenced the old one. |
| Contract deployed at all | **No.** The contract ID and its history are permanent on-chain. It can be paused or abandoned, never deleted. |
| Funds moved by a faulty upgrade | **No.** Nothing in this repository can reverse a settled transaction. |

**If a faulty upgrade is discovered after execution:**

1. **Pause first, diagnose second.** Contracts using `soroban_pausable` expose a
   pause entrypoint — use it to stop further damage before you understand the
   cause. A paused contract is recoverable; an actively-draining one may not be.
2. Notify maintainers and record the contract ID, the bad WASM hash, and the
   execution transaction.
3. Decide between rolling forward (a fix, through the normal timelock cycle) and
   rolling back to the previous WASM hash. Rolling forward is usually correct —
   the previous WASM may not understand the current state.
4. If state is corrupted, neither option helps. Treat it as an incident and
   follow [`../disaster-recovery-runbook.md`](../disaster-recovery-runbook.md).

The timelock delay is the only genuine undo in this list. Everything after
execution is mitigation.

---

## 5. Where deployments are tracked

`contracts/deployment/deployed/{network}.json`, one file per network, is the
record of what is deployed where. It is what makes
`deploy-soroban.sh` idempotent: a contract with an ID already recorded is
skipped on re-run.

- The deploy script writes entries automatically.
- A manual `stellar contract deploy` does **not** — add the entry by hand, in
  the same PR as the deployment, or the next script run will deploy a duplicate.
- To intentionally redeploy a contract, remove its entry first:

  ```bash
  jq 'del(.rent_wallet)' contracts/deployment/deployed/testnet.json > tmp.json \
    && mv tmp.json contracts/deployment/deployed/testnet.json
  ```

The `deployed/` directory currently contains only `.gitkeep` — no network file
has been committed yet, so there is no committed record of any deployment. The
first deployment recorded through a PR establishes it.

Backend environment variables that consume these IDs
(`SOROBAN_CONTRACT_ID`, `SOROBAN_STAKING_POOL_ID`, …) are listed in
[`DEPLOYMENT.md`](./DEPLOYMENT.md#backend-env-vars). Update them in the same
change as the deployment record, or the backend will keep talking to the old
contract.

---

## 6. Filling in the PR template

`.github/PULL_REQUEST_TEMPLATE.md` requires a *Contract Upgrade Details*
section. Each field maps to a step above:

| Template field | Where the value comes from |
| --- | --- |
| **Network** (Testnet / Mainnet) | §0. Contributors tick Testnet. |
| **Contract ID** (`C...`) | Output of `stellar contract deploy`, Step 3. |
| **WASM Hash** (`sha256:...`) | `sha256sum` from Step 2, **confirmed against on-chain** in §3. |
| **Deployer Public Key** (`G...`) | `stellar keys address <identity>` / `$STELLAR_DEPLOYER_ADDRESS`. |
| **Deploy Transaction** | Explorer link for the transaction from Step 3. Use the testnet explorer for testnet. |
| **Admin/upgrade authority is a multisig** | Tick only after §1 Step 6 and after `get_admin` read back the multisig address. |
| **Maintainer has reviewed and approved** | Maintainer ticks this, not the contributor. |
| **Upgrade transaction ready for signature (XDR)** | §2 step 4 — the unsigned upgrade transaction. |
| **New contract deployed successfully** | Step 3 plus the §3 hash match. Do not tick on the deploy alone. |
| **All existing tests pass** | `cargo test --workspace` at the built commit. |
| **Manual testing checklist** | What you exercised on testnet, named specifically. |
| **No breaking changes** | Interface diff against the previous WASM; list them if there are any. |

Alongside the hash, include the toolchain versions you built with
(`rustc --version`, `stellar --version`) so a reviewer can reproduce it.

---

## Validation status

The procedure above is assembled from the existing scripts, configs and docs in
this repository and from the fields the PR template requires. **It has not yet
been executed end to end against testnet.** The commands are transcribed from
`contracts/scripts/`, `contracts/deployment/scripts/deploy-soroban.sh` and
[`DEPLOYMENT.md`](./DEPLOYMENT.md) rather than observed, so treat step outputs as
expected rather than confirmed.

A testnet dry run is the natural follow-up, and any step that does not match
should be corrected here. Sections most likely to need adjustment on a real run:
the exact `stellar contract fetch` invocation in §3 (CLI surface has moved
between versions), and the per-contract `set_admin` entrypoint name in §1
Step 6, which is not uniform across the suite.
