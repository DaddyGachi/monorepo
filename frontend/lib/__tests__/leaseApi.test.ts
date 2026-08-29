import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateLease,
  sendLeaseForSigning,
  getLeaseSignUrl,
  getLease,
  getDocumentIntegrity,
  submitSignature,
  voidLease,
} from "../leaseApi";

beforeEach(() => {
  vi.clearAllMocks();
});

vi.mock("../apiClient", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
}));

import { apiGet, apiPost } from "../apiClient";

describe("generateLease", () => {
  it("POSTs to the correct endpoint with empty body", async () => {
    vi.mocked(apiPost).mockResolvedValue({
      success: true,
      data: { leaseId: "L-001", documentKey: "doc-key", documentHash: "hash", status: "draft" },
    });

    const result = await generateLease("D-001");

    expect(apiPost).toHaveBeenCalledWith("/api/deals/D-001/lease/generate", {});
    expect(result.success).toBe(true);
    expect(result.data.leaseId).toBe("L-001");
  });
});

describe("sendLeaseForSigning", () => {
  it("POSTs to send endpoint", async () => {
    vi.mocked(apiPost).mockResolvedValue({
      success: true,
      data: { message: "Lease sent" },
    });

    const result = await sendLeaseForSigning("D-002");

    expect(apiPost).toHaveBeenCalledWith("/api/deals/D-002/lease/send", {});
    expect(result.data.message).toBe("Lease sent");
  });
});

describe("getLeaseSignUrl", () => {
  it("GETs the signing URL", async () => {
    vi.mocked(apiGet).mockResolvedValue({
      success: true,
      data: { url: "https://sign.example.com", expiresAt: "2025-12-31", signerRole: "tenant" },
    });

    const result = await getLeaseSignUrl("D-003");

    expect(apiGet).toHaveBeenCalledWith("/api/deals/D-003/lease/sign-url");
    expect(result.data.signerRole).toBe("tenant");
  });
});

describe("getLease", () => {
  it("fetches lease details", async () => {
    vi.mocked(apiGet).mockResolvedValue({
      success: true,
      data: {
        leaseId: "L-001",
        dealId: "D-001",
        documentKey: "key",
        documentHash: "hash",
        documentVersion: "1.0",
        status: "draft",
        createdAt: "2025-01-01",
        updatedAt: "2025-01-01",
        lastModified: "2025-01-01",
      },
    });

    const result = await getLease("D-001");

    expect(apiGet).toHaveBeenCalledWith("/api/deals/D-001/lease");
    expect(result.data.status).toBe("draft");
  });
});

describe("getDocumentIntegrity", () => {
  it("fetches document integrity data", async () => {
    vi.mocked(apiGet).mockResolvedValue({
      success: true,
      data: { documentHash: "hash123", documentVersion: "1.0", lastModified: "2025-01-01" },
    });

    const result = await getDocumentIntegrity("D-004");

    expect(apiGet).toHaveBeenCalledWith("/api/deals/D-004/lease/integrity");
    expect(result.data.documentHash).toBe("hash123");
  });
});

describe("submitSignature", () => {
  it("POSTs signature data", async () => {
    vi.mocked(apiPost).mockResolvedValue({
      success: true,
      data: { success: true, leaseId: "L-001", signedAt: "2025-06-01", documentHash: "newhash" },
    });

    const sig = { signerName: "John", signDate: "2025-06-01", acknowledged: true };
    const result = await submitSignature("D-005", sig);

    expect(apiPost).toHaveBeenCalledWith("/api/deals/D-005/lease/sign", sig);
    expect(result.data.signedAt).toBe("2025-06-01");
  });
});

describe("voidLease", () => {
  it("POSTs to void endpoint", async () => {
    vi.mocked(apiPost).mockResolvedValue({
      success: true,
      data: { message: "Lease voided" },
    });

    const result = await voidLease("D-006");

    expect(apiPost).toHaveBeenCalledWith("/api/deals/D-006/lease/void", {});
    expect(result.data.message).toBe("Lease voided");
  });
});

describe("error handling", () => {
  it("propagates API errors from getLease", async () => {
    vi.mocked(apiGet).mockRejectedValue(new Error("404 Not Found"));

    await expect(getLease("D-999")).rejects.toThrow("404 Not Found");
  });

  it("propagates API errors from generateLease", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("500 Internal Server Error"));

    await expect(generateLease("D-999")).rejects.toThrow("500 Internal Server Error");
  });
});
