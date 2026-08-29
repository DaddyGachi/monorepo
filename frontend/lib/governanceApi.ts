import { apiFetch } from "./api";

/**
 * Client for the stake-weighted governance API (contracts/governance, issue #1494).
 *
 * Distinct from `timelockApi.ts` — that wraps the *timelock* admin queue, an
 * unrelated contract that merely reuses "governance" as its event-topic name.
 *
 * `create_proposal` and `vote` call `require_auth()` on-chain for the
 * proposer/voter, so this backend cannot sign those on a user's behalf. Both
 * follow a prepare -> sign (with the connected wallet) -> submit flow:
 * the `prepare*` calls return an unsigned XDR envelope, the caller signs it
 * client-side (see `useWallet().signTransaction`), and the signed envelope is
 * posted to the matching `submit*` endpoint.
 *
 * Paths below intentionally omit the `/api` prefix used elsewhere in this
 * directory (e.g. `lib/timelockApi.ts`, `lib/config.ts`'s staking calls) —
 * `apiFetch` already prepends `/api/v1`, and the governance router is mounted
 * at `/api/v1/governance` (backend/src/app.ts), not `/api/v1/api/...`. Several
 * existing sibling clients pass an extra leading `/api`, which — given
 * apiFetch's fixed `${baseUrl}/api/v1${path}` construction — cannot resolve to
 * any route this backend actually mounts; that looks like a pre-existing
 * inconsistency and is out of scope to fix here (see the PR description).
 */

export type GovernanceProposalStatus = "Active" | "Passed" | "Rejected" | "Executed" | "Cancelled";

export interface GovernanceProposal {
  id: number;
  proposer: string;
  paramKey: string;
  currentValue: string;
  proposedValue: string;
  votesFor: string;
  votesAgainst: string;
  status: GovernanceProposalStatus;
  createdAt: number;
  votingEndsAt: number;
  snapshottedTotalStaked: string;
}

interface ProposalListResponse {
  success: boolean;
  proposals: GovernanceProposal[];
  count: number;
}

interface ProposalResponse {
  success: boolean;
  proposal: GovernanceProposal;
}

interface UnsignedTxResponse {
  success: boolean;
  xdr: string;
}

interface TxHashResponse {
  success: boolean;
  txHash: string;
}

export function listProposals(): Promise<GovernanceProposal[]> {
  return apiFetch<ProposalListResponse>("/governance/proposals").then((res) => res.proposals);
}

export function getProposal(id: number): Promise<GovernanceProposal> {
  return apiFetch<ProposalResponse>(`/governance/proposals/${id}`).then((res) => res.proposal);
}

export function prepareCreateProposal(params: {
  paramKey: string;
  currentValue: string;
  proposedValue: string;
}): Promise<string> {
  return apiFetch<UnsignedTxResponse>("/governance/proposals/prepare", {
    method: "POST",
    body: JSON.stringify(params),
  }).then((res) => res.xdr);
}

export function submitCreateProposal(signedXdr: string): Promise<string> {
  return apiFetch<TxHashResponse>("/governance/proposals/submit", {
    method: "POST",
    body: JSON.stringify({ signedXdr }),
  }).then((res) => res.txHash);
}

export function prepareVote(proposalId: number, support: boolean): Promise<string> {
  return apiFetch<UnsignedTxResponse>(`/governance/proposals/${proposalId}/vote/prepare`, {
    method: "POST",
    body: JSON.stringify({ support }),
  }).then((res) => res.xdr);
}

export function submitVote(proposalId: number, signedXdr: string): Promise<string> {
  return apiFetch<TxHashResponse>(`/governance/proposals/${proposalId}/vote/submit`, {
    method: "POST",
    body: JSON.stringify({ signedXdr }),
  }).then((res) => res.txHash);
}

export function finalizeProposal(proposalId: number): Promise<string> {
  return apiFetch<TxHashResponse>(`/governance/proposals/${proposalId}/finalize`, {
    method: "POST",
  }).then((res) => res.txHash);
}

export function executeProposal(proposalId: number): Promise<string> {
  return apiFetch<TxHashResponse>(`/governance/proposals/${proposalId}/execute`, {
    method: "POST",
  }).then((res) => res.txHash);
}
