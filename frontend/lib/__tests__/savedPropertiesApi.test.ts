import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchSavedListingIds,
  saveListing,
  unsaveListing,
  setListingSaved,
} from "../savedPropertiesApi";

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

import { apiGet, apiPost, apiDelete } from "../apiClient";

describe("fetchSavedListingIds", () => {
  it("returns the data array from the response", async () => {
    vi.mocked(apiGet).mockResolvedValue({
      success: true,
      data: ["L-001", "L-002", "L-003"],
    });

    const result = await fetchSavedListingIds();

    expect(apiGet).toHaveBeenCalledWith("/api/tenant/saved-properties");
    expect(result).toEqual(["L-001", "L-002", "L-003"]);
  });

  it("returns empty array when no saved properties", async () => {
    vi.mocked(apiGet).mockResolvedValue({
      success: true,
      data: [],
    });

    const result = await fetchSavedListingIds();
    expect(result).toEqual([]);
  });
});

describe("saveListing", () => {
  it("POSTs to the correct endpoint with listing id", async () => {
    vi.mocked(apiPost).mockResolvedValue({
      success: true,
      data: { listingId: "L-001", saved: true },
    });

    await saveListing("L-001");

    expect(apiPost).toHaveBeenCalledWith(
      "/api/tenant/saved-properties/L-001",
      {},
    );
  });

  it("URL-encodes special characters in listing id", async () => {
    vi.mocked(apiPost).mockResolvedValue({
      success: true,
      data: { listingId: "L/001", saved: true },
    });

    await saveListing("L/001");

    expect(apiPost).toHaveBeenCalledWith(
      "/api/tenant/saved-properties/L%2F001",
      {},
    );
  });
});

describe("unsaveListing", () => {
  it("DELETEs the correct endpoint", async () => {
    vi.mocked(apiDelete).mockResolvedValue({
      success: true,
      data: { listingId: "L-001", saved: false },
    });

    await unsaveListing("L-001");

    expect(apiDelete).toHaveBeenCalledWith(
      "/api/tenant/saved-properties/L-001",
    );
  });
});

describe("setListingSaved", () => {
  it("calls saveListing when saved is true", async () => {
    vi.mocked(apiPost).mockResolvedValue({ success: true, data: { listingId: "L-001", saved: true } });

    await setListingSaved("L-001", true);

    expect(apiPost).toHaveBeenCalled();
    expect(apiDelete).not.toHaveBeenCalled();
  });

  it("calls unsaveListing when saved is false", async () => {
    vi.mocked(apiDelete).mockResolvedValue({ success: true, data: { listingId: "L-001", saved: false } });

    await setListingSaved("L-001", false);

    expect(apiDelete).toHaveBeenCalled();
    expect(apiPost).not.toHaveBeenCalled();
  });
});

describe("error handling", () => {
  it("propagates errors from fetchSavedListingIds", async () => {
    vi.mocked(apiGet).mockRejectedValue(new Error("Server Error"));
    await expect(fetchSavedListingIds()).rejects.toThrow("Server Error");
  });

  it("propagates errors from saveListing", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("Not Found"));
    await expect(saveListing("nonexistent")).rejects.toThrow("Not Found");
  });
});
