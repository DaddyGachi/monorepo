import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useAuthStore from "../useAuthStore";

vi.mock("@/lib/auth", () => ({
  getToken: vi.fn(async () => null),
  setToken: vi.fn(async () => {}),
  clearToken: vi.fn(),
}));

import { getToken, setToken, clearToken } from "@/lib/auth";

const mockGetToken = vi.mocked(getToken);
const mockSetToken = vi.mocked(setToken);
const mockClearToken = vi.mocked(clearToken);

function resetStore() {
  useAuthStore.setState({
    token: null,
    user: null,
    isAuthenticated: false,
  });
  vi.clearAllMocks();
}

describe("useAuthStore", () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
  });

  afterEach(() => {
    resetStore();
  });

  describe("initial state", () => {
    it("starts unauthenticated when no token exists", async () => {
      mockGetToken.mockResolvedValueOnce(null);
      resetStore();

      const { result } = renderHook(() => useAuthStore());
      await act(async () => {
        await result.current.initializeAuth();
      });

      expect(result.current.token).toBeNull();
      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
    });

    it("starts authenticated when a token exists", async () => {
      mockGetToken.mockResolvedValueOnce("existing-token");
      resetStore();

      const { result } = renderHook(() => useAuthStore());
      await act(async () => {
        await result.current.initializeAuth();
      });

      expect(result.current.token).toBe("existing-token");
      expect(result.current.isAuthenticated).toBe(true);
    });
  });

  describe("setToken", () => {
    it("sets token and marks authenticated", async () => {
      const { result } = renderHook(() => useAuthStore());

      await act(async () => {
        await result.current.setToken("tok_abc");
      });

      expect(result.current.token).toBe("tok_abc");
      expect(result.current.isAuthenticated).toBe(true);
      expect(mockSetToken).toHaveBeenCalledWith("tok_abc");
    });

    it("clears token when set to null", async () => {
      const { result } = renderHook(() => useAuthStore());

      await act(async () => {
        await result.current.setToken("tok_abc");
      });
      await act(async () => {
        await result.current.setToken(null);
      });

      expect(result.current.token).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
      expect(mockClearToken).toHaveBeenCalled();
    });
  });

  describe("setUser", () => {
    it("sets user data", () => {
      const { result } = renderHook(() => useAuthStore());
      const user = { id: "u1", email: "a@b.com", name: "Alice" };

      act(() => { result.current.setUser(user); });

      expect(result.current.user).toEqual(user);
    });

    it("clears user on null", () => {
      const { result } = renderHook(() => useAuthStore());

      act(() => { result.current.setUser({ id: "u1", email: "a@b.com" }); });
      act(() => { result.current.setUser(null); });

      expect(result.current.user).toBeNull();
    });
  });

  describe("logout", () => {
    it("clears all auth state", async () => {
      const { result } = renderHook(() => useAuthStore());

      await act(async () => {
        await result.current.setToken("tok_xyz");
      });
      act(() => { result.current.setUser({ id: "u1", email: "a@b.com" }); });

      expect(result.current.isAuthenticated).toBe(true);

      await act(async () => {
        await result.current.logout();
      });

      expect(result.current.token).toBeNull();
      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
      expect(mockClearToken).toHaveBeenCalled();
    });

    it("is idempotent — logout twice doesn't throw", async () => {
      const { result } = renderHook(() => useAuthStore());

      await act(async () => {
        await result.current.logout();
        await result.current.logout();
      });

      expect(result.current.isAuthenticated).toBe(false);
    });
  });

  describe("selectors", () => {
    it("isAuthenticated selector reflects state", async () => {
      const { result } = renderHook(() => useAuthStore());

      expect(useAuthStore.getState().isAuthenticated).toBe(false);

      await act(async () => {
        await result.current.setToken("tok_1");
      });
      expect(useAuthStore.getState().isAuthenticated).toBe(true);

      await act(async () => {
        await result.current.logout();
      });
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });
  });
});
