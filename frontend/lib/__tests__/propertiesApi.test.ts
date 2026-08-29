import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  searchProperties,
  getProperty,
  listPublicListings,
  type PropertySearchFilters,
  type PropertyListing,
} from "../propertiesApi";

const mockResponse = <T>(data: T) => Promise.resolve(data);

beforeEach(() => {
  vi.clearAllMocks();
});

vi.mock("../apiClient", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
  withQuery: (path: string, params: Record<string, string | number | boolean | undefined | null>) => {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value != null) qs.append(key, String(value));
    }
    const query = qs.toString();
    return query ? `${path}?${query}` : path;
  },
}));

import { apiGet } from "../apiClient";

const mockListing: PropertyListing = {
  listingId: "L-001",
  whistleblowerId: "W-001",
  address: "12 Marina Lagos",
  city: "Lagos",
  area: "Victoria Island",
  bedrooms: 3,
  bathrooms: 2,
  annualRentNgn: 5_000_000,
  photos: ["https://example.com/photo1.jpg"],
  status: "active",
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
};

describe("searchProperties", () => {
  it("constructs path with query params and calls apiGet", async () => {
    const mockData = {
      success: true,
      data: [mockListing],
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    };
    vi.mocked(apiGet).mockResolvedValue(mockData);

    const filters: PropertySearchFilters = {
      city: "Lagos",
      minBedrooms: 2,
      sortBy: "price_asc",
      page: 1,
      pageSize: 10,
    };

    const result = await searchProperties(filters);

    expect(apiGet).toHaveBeenCalledWith(
      expect.stringContaining("/api/properties/search?"),
    );
    expect(result).toEqual(mockData);
  });

  it("omits undefined filter values from query string", async () => {
    vi.mocked(apiGet).mockResolvedValue({
      success: true,
      data: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 0,
    });

    await searchProperties({ city: "Lagos" });

    const calledPath = vi.mocked(apiGet).mock.calls[0][0] as string;
    expect(calledPath).toContain("city=Lagos");
    expect(calledPath).not.toContain("minBedrooms");
  });

  it("returns empty array when no properties match", async () => {
    vi.mocked(apiGet).mockResolvedValue({
      success: true,
      data: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 0,
    });

    const result = await searchProperties({});
    expect(result.data).toEqual([]);
    expect(result.total).toBe(0);
  });
});

describe("getProperty", () => {
  it("fetches a single property by id", async () => {
    vi.mocked(apiGet).mockResolvedValue({
      success: true,
      data: mockListing,
    });

    const result = await getProperty("L-001");

    expect(apiGet).toHaveBeenCalledWith("/api/properties/L-001");
    expect(result.data.listingId).toBe("L-001");
  });
});

describe("listPublicListings", () => {
  it("calls /api/properties with no params when none provided", async () => {
    vi.mocked(apiGet).mockResolvedValue({
      success: true,
      data: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 0,
    });

    await listPublicListings();

    expect(apiGet).toHaveBeenCalledWith("/api/properties");
  });

  it("joins listingIds with comma", async () => {
    vi.mocked(apiGet).mockResolvedValue({
      success: true,
      data: [mockListing],
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    });

    await listPublicListings({ listingIds: ["L-001", "L-002"] });

    const calledPath = vi.mocked(apiGet).mock.calls[0][0] as string;
    expect(calledPath).toContain("listingIds=L-001%2CL-002");
  });

  it("includes page and pageSize in query", async () => {
    vi.mocked(apiGet).mockResolvedValue({
      success: true,
      data: [],
      total: 0,
      page: 2,
      pageSize: 5,
      totalPages: 10,
    });

    await listPublicListings({ page: 2, pageSize: 5 });

    const calledPath = vi.mocked(apiGet).mock.calls[0][0] as string;
    expect(calledPath).toContain("page=2");
    expect(calledPath).toContain("pageSize=5");
  });

  it("omits empty listingIds array from query", async () => {
    vi.mocked(apiGet).mockResolvedValue({
      success: true,
      data: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 0,
    });

    await listPublicListings({ listingIds: [] });

    const calledPath = vi.mocked(apiGet).mock.calls[0][0] as string;
    expect(calledPath).not.toContain("listingIds");
  });
});

describe("error handling", () => {
  it("propagates apiGet errors", async () => {
    vi.mocked(apiGet).mockRejectedValue(new Error("Network error"));

    await expect(searchProperties({})).rejects.toThrow("Network error");
  });
});
