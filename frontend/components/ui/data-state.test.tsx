import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  EmptyState,
  ErrorState,
  LoadingAnnouncer,
  LoadingState,
  MoneyValue,
} from "./data-state";

const formatNgn = (amount: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
  }).format(amount);

describe("MoneyValue", () => {
  it("renders a skeleton and no digits while loading", () => {
    const { container } = render(
      <MoneyValue status="loading" amount={undefined} format={formatNgn} />,
    );

    expect(container.querySelector('[data-slot="skeleton"]')).not.toBeNull();
    // The critical guarantee: nothing numeric reaches the DOM mid-fetch.
    expect(container.textContent).not.toMatch(/\d/);
  });

  it("announces the in-flight fetch to assistive technology", () => {
    render(
      <MoneyValue
        status="loading"
        amount={undefined}
        format={formatNgn}
        loadingLabel="Loading balance"
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Loading balance");
  });

  it("renders an explicit dash rather than a number on error", () => {
    const { container } = render(
      <MoneyValue
        status="error"
        amount={undefined}
        format={formatNgn}
        unavailableLabel="Balance unavailable"
      />,
    );

    expect(container.textContent).toContain("—");
    expect(container.textContent).not.toMatch(/\d/);
    expect(screen.getByText("Balance unavailable")).toBeInTheDocument();
  });

  it("does not treat a missing amount as zero", () => {
    for (const amount of [null, undefined, Number.NaN]) {
      const { container, unmount } = render(
        <MoneyValue status="ready" amount={amount} format={formatNgn} />,
      );
      expect(container.textContent).toContain("—");
      expect(container.textContent).not.toMatch(/0/);
      unmount();
    }
  });

  it("formats a real amount once it has arrived", () => {
    const { container } = render(
      <MoneyValue status="ready" amount={4500000} format={formatNgn} />,
    );

    expect(container.textContent).toContain("4,500,000");
  });

  it("still renders a genuine zero it was given", () => {
    const { container } = render(
      <MoneyValue status="ready" amount={0} format={formatNgn} />,
    );

    expect(container.textContent).toContain("0");
    expect(container.textContent).not.toContain("—");
  });
});

describe("LoadingState", () => {
  it("announces the fetch and hides the placeholder shapes", () => {
    const { container } = render(
      <LoadingState label="Loading payment history">
        <div data-testid="shape" />
      </LoadingState>,
    );

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Loading payment history");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(
      container.querySelector('[data-slot="loading-state"]'),
    ).toHaveAttribute("aria-hidden", "true");
  });
});

describe("LoadingAnnouncer", () => {
  it("renders a polite live region with no visual box", () => {
    render(<LoadingAnnouncer label="Loading stats" />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Loading stats");
    expect(status.className).toContain("sr-only");
  });
});

describe("ErrorState", () => {
  it("is exposed as an alert and offers a working retry", async () => {
    const onRetry = vi.fn();
    render(
      <ErrorState
        title="Failed to load payouts"
        description="Network request failed"
        onRetry={onRetry}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Failed to load payouts");
    expect(screen.getByText("Network request failed")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("never tells the user to reload the page", () => {
    render(<ErrorState description="boom" onRetry={() => {}} />);
    expect(screen.getByRole("alert").textContent).not.toMatch(
      /reload|refresh the page/i,
    );
  });
});

describe("EmptyState", () => {
  it("guides the user toward the action that would populate it", () => {
    render(
      <EmptyState
        title="No saved properties yet"
        description="Tap the heart icon on any listing to save it here."
        action={{ label: "Browse properties", href: "/properties" }}
      />,
    );

    expect(screen.getByText("No saved properties yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Browse properties" })).toHaveAttribute(
      "href",
      "/properties",
    );
  });

  it("supports a callback action for in-page next steps", async () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        title="No properties found"
        description="Clearing your filters widens the search."
        action={{ label: "Clear filters", onClick }}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("is not announced as an alert, so it stays distinct from an error", () => {
    render(<EmptyState title="Nothing here" description="Yet." />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
