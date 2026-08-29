import type { Metadata } from "next";
import { AuthGuard } from "@/components/auth-guard";
import { DashboardA11yEnhancer } from "@/components/dashboard/DashboardA11yEnhancer";
import { privatePageMetadata } from "@/lib/seo";

/**
 * Every dashboard route sits behind AuthGuard and shows one user's own lease,
 * payments, or portfolio, so the whole segment is excluded from indexing.
 */
export const metadata: Metadata = privatePageMetadata("Dashboard");

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AuthGuard>
      <DashboardA11yEnhancer />
      {children}
    </AuthGuard>
  );
}
