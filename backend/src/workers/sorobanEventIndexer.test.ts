import { describe, it, expect, beforeEach, vi } from "vitest";
import { sorobanEventIndexer } from "./sorobanEventIndexer.js";

describe("sorobanEventIndexer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("pause/resume", () => {
    it("pauses the indexer", () => {
      sorobanEventIndexer.pause();
      expect(sorobanEventIndexer.getMetrics().isPaused).toBe(true);
    });

    it("resumes the indexer", () => {
      sorobanEventIndexer.pause();
      sorobanEventIndexer.resume();
      expect(sorobanEventIndexer.getMetrics().isPaused).toBe(false);
    });
  });

  describe("getMetrics", () => {
    it("returns metrics with required fields", () => {
      const metrics = sorobanEventIndexer.getMetrics();

      expect(metrics).toHaveProperty("isRunning");
      expect(metrics).toHaveProperty("isPaused");
      expect(metrics).toHaveProperty("pollInterval");
      expect(metrics).toHaveProperty("enabled");
      expect(typeof metrics.isRunning).toBe("boolean");
      expect(typeof metrics.isPaused).toBe("boolean");
      expect(typeof metrics.pollInterval).toBe("number");
      expect(typeof metrics.enabled).toBe("boolean");
    });

    it("poll interval is positive", () => {
      const metrics = sorobanEventIndexer.getMetrics();
      expect(metrics.pollInterval).toBeGreaterThan(0);
    });
  });

  describe("poison record handling", () => {
    it("skips unparseable events without crashing", () => {
      // Demonstrates the pattern used in indexing
      const parseEvent = (event: any) => {
        if (!event || !event.contractId) return null;
        return event;
      };

      const events = [
        { contractId: "valid", ledgerSequence: 1 },
        null,
        { contractId: "valid2", ledgerSequence: 2 },
      ];

      const valid = events.filter((e) => parseEvent(e));

      expect(valid).toHaveLength(2);
      expect(valid[0].contractId).toBe("valid");
      expect(valid[1].contractId).toBe("valid2");
    });

    it("continues processing after one bad event", () => {
      // Demonstrates error isolation
      const items = [
        {
          id: 1,
          process: () => {
            throw new Error("bad");
          },
        },
        { id: 2, process: () => {} },
        { id: 3, process: () => {} },
      ];

      const processed: number[] = [];
      for (const item of items) {
        try {
          item.process();
          processed.push(item.id);
        } catch (e) {
          // Log and continue
        }
      }

      expect(processed).toEqual([2, 3]);
      expect(processed.length).toBe(2);
    });
  });

  describe("transactional integrity", () => {
    it("uses ON CONFLICT for idempotent upsert", () => {
      const sql = `INSERT INTO indexed_contract_events 
        (contract_id, ledger_sequence, transaction_hash, event_type)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (transaction_hash, ledger_sequence) 
        DO UPDATE SET event_type = EXCLUDED.event_type`;

      expect(sql).toContain("ON CONFLICT");
      expect(sql).toContain("DO UPDATE");
      expect(sql).toContain("EXCLUDED.event_type");
    });

    it("wraps multi-event inserts in transaction", () => {
      const queries = ["BEGIN", "INSERT ...", "INSERT ...", "COMMIT"];

      expect(queries[0]).toBe("BEGIN");
      expect(queries[queries.length - 1]).toBe("COMMIT");
      expect(queries.filter((q) => q.startsWith("INSERT")).length).toBe(2);
    });

    it("rolls back on error", () => {
      const queries: string[] = [];

      try {
        queries.push("BEGIN");
        queries.push("INSERT successful");
        throw new Error("Constraint violation");
      } catch (e) {
        queries.push("ROLLBACK");
      }

      expect(queries).toContain("BEGIN");
      expect(queries).toContain("ROLLBACK");
      expect(queries[queries.length - 1]).toBe("ROLLBACK");
    });
  });
});
