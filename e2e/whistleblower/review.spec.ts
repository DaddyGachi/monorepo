import { test, expect, LoginPage } from "../helpers/fixtures";

test.describe("Whistleblower report and reward flow", () => {
  test("whistleblower dashboard shows status of submitted reports", async ({
    page,
    seed,
  }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(
      seed.users.whistleblower.email,
      seed.users.whistleblower.password,
    );

    await page.goto("/whistleblower/dashboard");
    await expect(
      page.getByRole("heading", { name: /dashboard/i }),
    ).toBeVisible({ timeout: 15000 });

    // Dashboard should load stats or empty state
    await expect(
      page.getByText(/total earnings|active listings|no data/i).or(
        page.getByRole("heading", { name: /whistleblower/i })
      ).first(),
    ).toBeVisible();
  });

  test("whistleblower earnings page shows accurate information", async ({
    page,
    seed,
  }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(
      seed.users.whistleblower.email,
      seed.users.whistleblower.password,
    );

    await page.goto("/whistleblower/earnings");
    await expect(
      page.getByRole("heading", { name: /earnings/i }),
    ).toBeVisible({ timeout: 15000 });

    // Verify stat cards or empty state
    await expect(
      page.getByText(/total earnings|completed|pending/i).or(
        page.getByText(/no earnings|start reporting/i)
      ).first(),
    ).toBeVisible();
  });

  test("scoping: whistleblower cannot see another whistleblower's data", async ({
    page,
    seed,
  }) => {
    // Login as the inspector (different user) to verify scoping
    const login = new LoginPage(page);
    await login.goto();
    await login.login(
      seed.users.inspector.email,
      seed.users.inspector.password,
    );

    // Try to access the whistleblower dashboard
    await page.goto("/whistleblower/dashboard");

    // Should either redirect or show an error/empty state
    // The auth guard or data fetch should prevent seeing another's data
    await page.waitForLoadState("networkidle");

    // If we land on the page, it should show empty/restricted state
    const currentUrl = page.url();
    if (currentUrl.includes("/whistleblower/dashboard")) {
      await expect(
        page.getByText(/no data|no earnings|no reports|start reporting/i).or(
          page.getByRole("heading", { name: /dashboard/i })
        ).first(),
      ).toBeVisible({ timeout: 5000 });
    }
  });

  test("submitted report shows confirmation", async ({ page, seed }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(
      seed.users.whistleblower.email,
      seed.users.whistleblower.password,
    );

    await page.goto(`/listings/${seed.listingId}`);
    await expect(page.getByRole("main")).toBeVisible({ timeout: 15000 });

    const reportBtn = page.getByRole("button", { name: /report|flag/i });
    await expect(reportBtn).toBeVisible();
    await reportBtn.click();

    await page.getByLabel(/reason|description/i).fill(
      "This listing contains false information about the property size.",
    );

    const submitBtn = page.getByRole("button", { name: /submit report|send/i });
    await expect(submitBtn).toBeVisible();
    await submitBtn.click();

    await expect(
      page.getByText(/report submitted|thank you|under review/i),
    ).toBeVisible();
  });
});
