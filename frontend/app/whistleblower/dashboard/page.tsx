"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { DashboardHeader } from "@/components/dashboard-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  EmptyState,
  ErrorState,
  ListRowSkeleton,
  LoadingState,
  StatCardSkeleton,
} from "@/components/ui/data-state";
import {
  Plus,
  TrendingUp,
  CheckCircle,
  Clock,
  AlertCircle,
  Star,
  DollarSign,
  Home,
} from "lucide-react";
import {
  getWhistleblowerDashboardData,
  type WhistleblowerDashboardData,
} from "@/lib/api/whistleblowerDashboard";
import useAuthStore from "@/store/useAuthStore";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import {
  DashboardA11yEnhancer,
  DASHBOARD_MAIN_ID,
} from "@/components/dashboard/DashboardA11yEnhancer";

export default function WhistleblowerDashboard() {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<WhistleblowerDashboardData | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await getWhistleblowerDashboardData();
      setData(result);
      setError(null);
    } catch (err) {
      console.error("Failed to fetch whistleblower data:", err);
      setError(
        "Failed to connect to live data. Please ensure the backend is running.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4 pt-24 md:p-8 md:pt-28">
        <LoadingState
          label="Loading your whistleblower dashboard"
          className="mx-auto max-w-5xl space-y-8"
        >
          <div className="grid gap-4 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <StatCardSkeleton key={`wb-stat-${index}`} />
            ))}
          </div>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <ListRowSkeleton key={`wb-row-${index}`} />
            ))}
          </div>
        </LoadingState>
      </div>
    );
  }

  // Use live data if available, otherwise show error
  const dashboardData = data?.stats;
  const listings = data?.listings || [];
  const earnings = data?.earnings || [];

  if (error && !data) {
    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center bg-background p-4">
        <ErrorState
          className="w-full max-w-md"
          title="We couldn't reach your dashboard"
          description={error}
          onRetry={fetchData}
          retryLabel="Retry connection"
        />
      </div>
    );
  }

  if (!dashboardData) return null;

  return (
    <div className="min-h-screen bg-background">
      <DashboardA11yEnhancer />
      <DashboardHeader />

      <DashboardSidebar
        role="whistleblower"
        userInfo={{
          name: user?.name ?? "Whistleblower",
          roleLabel: "",
          extra: (
            <div className="mt-2 flex items-center gap-1">
              <Star className="h-4 w-4 fill-accent text-accent" />
              <span className="text-sm font-bold">{dashboardData.rating}</span>
              <span className="text-xs text-muted-foreground">
                ({dashboardData.reviews} reviews)
              </span>
            </div>
          ),
        }}
      />

      {/* Main Content */}
      <main
        id={DASHBOARD_MAIN_ID}
        tabIndex={-1}
        className="min-h-screen pt-20 lg:ml-64"
      >
        <div className="p-4 md:p-6 lg:p-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-foreground md:text-3xl lg:text-4xl">
              Whistleblower Dashboard
            </h1>
            <p className="mt-2 text-sm text-muted-foreground md:text-base">
              Report vacant apartments and earn ₦10-20k per successful rental
            </p>
          </div>

          {/* Stats Grid */}
          <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-6">
            <Card className="border-3 border-foreground p-3 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] md:p-6">
              <div className="flex items-center gap-2 md:gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center border-3 border-foreground bg-primary md:h-14 md:w-14">
                  <DollarSign className="h-5 w-5 md:h-7 md:w-7" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs text-muted-foreground md:text-sm">
                    Total Earnings
                  </p>
                  <p className="truncate text-xl font-bold text-foreground md:text-3xl">
                    ₦{dashboardData.totalEarnings.toLocaleString()}
                  </p>
                </div>
              </div>
            </Card>

            <Card className="border-3 border-foreground p-3 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] md:p-6">
              <div className="flex items-center gap-2 md:gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center border-3 border-foreground bg-secondary md:h-14 md:w-14">
                  <CheckCircle className="h-5 w-5 md:h-7 md:w-7" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs text-muted-foreground md:text-sm">
                    Reports This Month
                  </p>
                  <p className="truncate text-xl font-bold text-foreground md:text-3xl">
                    {dashboardData.reportsThisMonth}/
                    {dashboardData.maxReportsPerMonth}
                  </p>
                </div>
              </div>
            </Card>

            <Card className="border-3 border-foreground p-3 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] md:p-6">
              <div className="flex items-center gap-2 md:gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center border-3 border-foreground bg-accent md:h-14 md:w-14">
                  <Home className="h-5 w-5 md:h-7 md:w-7" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs text-muted-foreground md:text-sm">
                    Active Listings
                  </p>
                  <p className="truncate text-xl font-bold text-foreground md:text-3xl">
                    {dashboardData.activeListings}
                  </p>
                </div>
              </div>
            </Card>

            <Card className="border-3 border-foreground p-3 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] md:p-6">
              <div className="flex items-center gap-2 md:gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center border-3 border-foreground bg-muted md:h-14 md:w-14">
                  <TrendingUp className="h-5 w-5 md:h-7 md:w-7" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs text-muted-foreground md:text-sm">
                    Rating
                  </p>
                  <p className="truncate text-xl font-bold text-foreground md:text-3xl">
                    {dashboardData.rating}⭐
                  </p>
                </div>
              </div>
            </Card>
          </div>

          {/* Report Limit Warning */}
          {dashboardData.reportsThisMonth >=
            dashboardData.maxReportsPerMonth && (
            <div className="mb-8 border-3 border-destructive bg-red-100 p-4 rounded-sm">
              <div className="flex gap-2">
                <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-destructive mb-1">
                    Monthly Limit Reached
                  </p>
                  <p className="text-xs text-destructive/80">
                    You've reached your {dashboardData.maxReportsPerMonth}{" "}
                    apartment limit for this month. Come back next month to
                    report more.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Active Listings */}
          <div className="mb-8">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-mono text-lg font-bold md:text-xl">
                Your Active Listings
              </h2>
              {dashboardData.reportsThisMonth <
                dashboardData.maxReportsPerMonth && (
                <Link href="/whistleblower/report">
                  <Button className="border-3 border-foreground bg-primary font-bold shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
                    <Plus className="mr-2 h-4 w-4" />
                    Report Apartment
                  </Button>
                </Link>
              )}
            </div>

            <div className="space-y-4">
              {listings.length === 0 ? (
                <EmptyState
                  icon={Home}
                  title="No active listings"
                  description="Report a vacant apartment you know of — you earn a reward once a tenant rents it through Shelterflex."
                  action={{
                    label: "Report an apartment",
                    href: "/whistleblower/report",
                  }}
                />
              ) : (
                listings.map((listing) => (
                  <Card
                    key={listing.id}
                    className="border-3 border-foreground p-4 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] md:p-6"
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div>
                        <h3 className="text-lg font-bold text-foreground md:text-xl">
                          {listing.address}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          ₦{listing.price.toLocaleString()}/year •{" "}
                          {listing.beds} bed(s) • {listing.baths} bath(s)
                        </p>
                        <p className="text-xs text-muted-foreground mt-2">
                          Posted: {listing.postedDate}
                        </p>
                      </div>

                      <div className="flex gap-4">
                        <div className="flex flex-col items-center gap-1 border-l-2 border-foreground pl-4">
                          <p className="text-xs text-muted-foreground">Views</p>
                          <p className="text-lg font-bold">{listing.views}</p>
                        </div>

                        <div className="flex flex-col items-center gap-1 border-l-2 border-foreground pl-4">
                          <p className="text-xs text-muted-foreground">
                            Status
                          </p>
                          <div
                            className={`text-sm font-bold ${listing.status === "rented" ? "text-secondary" : "text-primary"}`}
                          >
                            {listing.status === "rented"
                              ? "✓ Rented"
                              : listing.status.charAt(0).toUpperCase() +
                                listing.status.slice(1)}
                          </div>
                        </div>

                        {listing.status === "rented" && (
                          <div className="flex flex-col items-center gap-1 border-l-2 border-foreground pl-4">
                            <p className="text-xs text-muted-foreground">
                              Earned
                            </p>
                            <p className="text-lg font-bold text-primary">
                              ₦{listing.earnings.toLocaleString()}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </div>

          {/* Recent Earnings */}
          <div>
            <h2 className="font-mono text-lg font-bold mb-4 md:text-xl">
              Recent Earnings
            </h2>
            <div className="space-y-3">
              {earnings.length === 0 ? (
                <EmptyState
                  icon={DollarSign}
                  title="No earnings yet"
                  description="Rewards land here after a tenant you reported completes their first payment."
                  action={{
                    label: "Report an apartment",
                    href: "/whistleblower/report",
                  }}
                />
              ) : (
                earnings.map((earning, idx) => (
                  <Card
                    key={`${earning.listing}-${earning.date}-${idx}`}
                    className="border-3 border-foreground p-4 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]"
                  >
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-sm font-bold">{earning.listing}</p>
                        <p className="text-xs text-muted-foreground">
                          {earning.date}
                        </p>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <p className="text-lg font-bold text-primary">
                          +₦{earning.amount.toLocaleString()}
                        </p>
                        <div
                          className={`flex items-center gap-1 px-3 py-1 border-2 border-foreground text-xs font-bold ${earning.status === "completed" ? "bg-secondary" : "bg-accent"}`}
                        >
                          {earning.status === "completed" ? (
                            <CheckCircle className="h-4 w-4" />
                          ) : (
                            <Clock className="h-4 w-4" />
                          )}
                          {earning.status === "completed"
                            ? "Completed"
                            : "Pending"}
                        </div>
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
