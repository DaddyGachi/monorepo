import { clearAuthenticatedOfflineState } from "./offline-session";
import { secureStorage } from "./secure-storage";

const TOKEN_KEY = "shelterflex_token";

export async function getToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  return await secureStorage.getItem(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  if (typeof window === "undefined") return;
  await secureStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  if (typeof window === "undefined") return;
  secureStorage.removeItem(TOKEN_KEY);
}

export async function isAuthenticated(): Promise<boolean> {
  return !!(await getToken());
}

export async function logout(): Promise<void> {
  clearToken();
  await clearAuthenticatedOfflineState();
  // Redirect to homepage after logout
  if (typeof window !== "undefined") {
    window.location.href = "/";
  }
}

// Function to handle post-authentication redirect
export function handleAuthRedirect(returnTo?: string): void {
  if (typeof window === "undefined") return;
  
  const targetUrl = returnTo ? decodeURIComponent(returnTo) : "/";
  
  // Prevent infinite redirect loops
  if (window.location.pathname === targetUrl) {
    return;
  }
  
  window.location.href = targetUrl;
}
