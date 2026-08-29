import { describe, it, expect, beforeEach } from "vitest";
import { vi } from "vitest";

type Row = Record<string, unknown>;

class MockDealPool {
  deals: Row[] = [];

  async query(
    text: string,
    params: unknown[] = [],
  ): Promise<{ rows: Row[]; rowCount: number }> {
    const t = text.trim();

    if (t.includes("INSERT INTO deals")) {
      const [id, canonicalRef, status, payload] = params as [
        string,
        string,
        string,
        Record<string, unknown>,
      ];
      const row: Row = {
        id,
        canonical_external_ref_v1: canonicalRef,
        status,
        payload,
        updated_at: new Date(),
        created_at: new Date(),
      };
      this.deals.push(row);
      return { rows: [], rowCount: 1 };
    }

    if (t.includes("WHERE canonical_external_ref_v1 = $1")) {
      const [ref] = params as [string];
      const row = this.deals.find((r) => r.canonical_external_ref_v1 === ref);
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }

    if (t.includes("UPDATE deals SET status")) {
      const [id, status] = params as [string, string];
      const deal = this.deals.find((r) => r.id === id);
      if (deal) deal.status = status;
      return { rows: [], rowCount: deal ? 1 : 0 };
    }

    return { rows: [], rowCount: 0 };
  }
}

const fakePool = new MockDealPool();

vi.mock("../db.js", () => ({
  getPool: vi.fn(async () => fakePool),
  setPool: vi.fn(),
  getPoolMetrics: vi.fn(() => null),
}));

describe("DealRepository", () => {
  beforeEach(() => {
    fakePool.deals = [];
  });

  async function getRepo() {
    const mod = await import("./DealRepository.js");
    return new mod.DealRepository();
  }

  it("creates a deal", async () => {
    const repo = await getRepo();
    const deal = {
      id: "deal-1",
      canonicalRef: "ref-1",
      status: "initiated",
      payload: { amount: 1000 },
    };

    await repo.create(deal);

    expect(fakePool.deals).toHaveLength(1);
    expect(fakePool.deals[0].canonical_external_ref_v1).toBe("ref-1");
  });

  it("finds deal by canonical reference", async () => {
    const repo = await getRepo();
    const ref = "ext-ref-1";
    await repo.create({
      id: "deal-1",
      canonicalRef: ref,
      status: "pending",
      payload: {},
    });

    const found = await repo.findByCanonicalRef(ref);

    expect(found).toBeDefined();
    expect(found?.canonical_external_ref_v1).toBe(ref);
  });

  it("returns null for missing reference", async () => {
    const repo = await getRepo();

    const found = await repo.findByCanonicalRef("nonexistent");

    expect(found).toBeNull();
  });

  it("updates deal status", async () => {
    const repo = await getRepo();
    const dealId = "deal-1";
    await repo.create({
      id: dealId,
      canonicalRef: "ref-1",
      status: "initiated",
      payload: {},
    });

    await repo.updateStatus(dealId, "completed");

    expect(fakePool.deals[0].status).toBe("completed");
  });
});
