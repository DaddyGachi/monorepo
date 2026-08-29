import { describe, it, expect, vi, beforeEach } from "vitest";
import { getApartmentReviews, getApartmentAggregateRating } from "../reviewApi";

beforeEach(() => {
  vi.clearAllMocks();
});

vi.mock("../api", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "../api";

const mockReviewsResponse = {
  reviews: [
    {
      id: "R-001",
      apartmentId: "A-001",
      userId: "U-001",
      rating: 4,
      content: "Great apartment",
      date: "2025-01-01",
      verifiedStay: true,
      isHidden: false,
      isReported: false,
      helpfulCount: 5,
    },
  ],
  total: 1,
  page: 1,
  pageSize: 10,
  totalPages: 1,
  aggregateRating: 4.0,
};

describe("getApartmentReviews", () => {
  it("fetches reviews with no filters", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      reviews: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 0,
    });

    const result = await getApartmentReviews({});

    expect(apiFetch).toHaveBeenCalledWith(
      expect.stringContaining("/apartment-reviews?"),
    );
    expect(result.reviews).toEqual([]);
  });

  it("includes apartmentId filter", async () => {
    vi.mocked(apiFetch).mockResolvedValue(mockReviewsResponse);

    await getApartmentReviews({ apartmentId: "A-001" });

    const url = vi.mocked(apiFetch).mock.calls[0][0] as string;
    expect(url).toContain("apartmentId=A-001");
  });

  it("includes all filter params", async () => {
    vi.mocked(apiFetch).mockResolvedValue(mockReviewsResponse);

    await getApartmentReviews({
      apartmentId: "A-001",
      rating: 5,
      verifiedStay: true,
      sortBy: "newest",
      page: 2,
      pageSize: 5,
    });

    const url = vi.mocked(apiFetch).mock.calls[0][0] as string;
    expect(url).toContain("apartmentId=A-001");
    expect(url).toContain("rating=5");
    expect(url).toContain("verifiedStay=true");
    expect(url).toContain("sortBy=newest");
    expect(url).toContain("page=2");
    expect(url).toContain("pageSize=5");
  });

  it("omits undefined filter values", async () => {
    vi.mocked(apiFetch).mockResolvedValue(mockReviewsResponse);

    await getApartmentReviews({ apartmentId: "A-001" });

    const url = vi.mocked(apiFetch).mock.calls[0][0] as string;
    expect(url).not.toContain("rating");
    expect(url).not.toContain("sortBy");
  });

  it("returns the full response including aggregateRating", async () => {
    vi.mocked(apiFetch).mockResolvedValue(mockReviewsResponse);

    const result = await getApartmentReviews({});

    expect(result.aggregateRating).toBe(4.0);
    expect(result.reviews).toHaveLength(1);
  });
});

describe("getApartmentAggregateRating", () => {
  it("returns aggregateRating and total from a page-1 request", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      ...mockReviewsResponse,
      aggregateRating: 4.5,
      total: 42,
    });

    const result = await getApartmentAggregateRating("A-001");

    const url = vi.mocked(apiFetch).mock.calls[0][0] as string;
    expect(url).toContain("apartmentId=A-001");
    expect(url).toContain("pageSize=1");
    expect(result.averageRating).toBe(4.5);
    expect(result.totalReviews).toBe(42);
  });

  it("returns null averageRating when aggregateRating is undefined", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      reviews: [],
      total: 0,
      page: 1,
      pageSize: 1,
      totalPages: 0,
    });

    const result = await getApartmentAggregateRating("A-999");

    expect(result.averageRating).toBeNull();
    expect(result.totalReviews).toBe(0);
  });

  it("returns null averageRating when aggregateRating is null", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      reviews: [],
      total: 0,
      page: 1,
      pageSize: 1,
      totalPages: 0,
      aggregateRating: null,
    });

    const result = await getApartmentAggregateRating("A-999");

    expect(result.averageRating).toBeNull();
  });
});

describe("error handling", () => {
  it("propagates errors from getApartmentReviews", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error("Server Error"));
    await expect(getApartmentReviews({})).rejects.toThrow("Server Error");
  });

  it("propagates errors from getApartmentAggregateRating", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error("Not Found"));
    await expect(getApartmentAggregateRating("nonexistent")).rejects.toThrow("Not Found");
  });
});
