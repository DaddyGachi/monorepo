import { test, expect, LoginPage } from "../helpers/fixtures";
import { dbQuery, dbClose, waitForDb } from "../helpers/db";

/**
 * Landlord verification and admin review (#1432)
 *
 * Verification is the check standing between a fraudulent listing and a tenant's
 * deposit. This spec drives the multi-actor path — landlord submits, admin
 * reviews, admin decides, the landlord's status changes — and asserts the parts
 * that a badge cannot tell you: that the server, not the UI, enforces who may
 * decide, and that the decision reaches the audit trail.
 *
 * Only the flow under test goes through the browser. Prerequisites are seeded via
 * the database helper. Every wait is a wait on a condition — no fixed sleeps.
 */

interface VerificationRow {
  user_id: string;
  verification_level: string;
  verified_at: string | null;
}

async function verificationLevelOf(landlordId: string): Promise<string> {
  const rows = await dbQuery<VerificationRow>(
    `SELECT user_id, verification_level, verified_at
       FROM landlord_profiles WHERE user_id = $1`,
    [landlordId],
  );
  return rows[0]?.verification_level ?? "unverified";
}

/** Submitted verification document, standing in for the landlord's upload step. */
async function seedVerificationDocument(landlordId: string, key: string): Promise<void> {
  await dbQuery(
    `INSERT INTO kyc_documents (user_id, document_type, front_image_key, status, attempt_count)
     VALUES ($1, 'proof_of_ownership', $2, 'pending', 1)`,
    [landlordId, key],
  );
}

test.describe("Landlord verification → admin review → capability change", () => {
  test.afterAll(async () => {
    await dbClose();
  });

  test.beforeEach(async ({ seed }) => {
    // Each test starts from a known state so the file is repeatable.
    await dbQuery(
      `UPDATE landlord_profiles SET verification_level = 'unverified', verified_at = NULL
        WHERE user_id = $1`,
      [seed.users.landlord.id],
    );
  });

  test("admin approves → the landlord's server-side status changes and the landlord sees it", async ({
    page,
    seed,
  }) => {
    const landlordId = seed.users.landlord.id!;
    expect(await verificationLevelOf(landlordId)).toBe("unverified");

    const login = new LoginPage(page);
    await login.goto();
    await login.login(seed.users.admin.email, seed.users.admin.password);

    await page.goto(`/admin/landlords/${landlordId}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    await page.getByRole("button", { name: /landlord \+ property verified/i }).click();
    await page.getByLabel(/reason|note/i).fill("Title deed and ID verified against registry — e2e");
    await page.getByRole("button", { name: /save|update|verify/i }).first().click();

    // Asserted against the server, not the badge.
    const rows = await waitForDb<VerificationRow>(
      `SELECT user_id, verification_level, verified_at FROM landlord_profiles WHERE user_id = $1`,
      [landlordId],
      r => r[0]?.verification_level === "id_and_property_verified",
      { what: "the approval to be persisted" },
    );
    expect(rows[0].verified_at).not.toBeNull();

    // The landlord's own status endpoint reports the same thing.
    const status = await page.request.get(`/api/v1/landlords/${landlordId}/verification-status`);
    expect(status.ok()).toBe(true);
    expect((await status.json()).level).toBe("id_and_property_verified");
  });

  test("admin rejects → the landlord sees an accurate unverified status", async ({ page, seed }) => {
    const landlordId = seed.users.landlord.id!;

    const login = new LoginPage(page);
    await login.goto();
    await login.login(seed.users.admin.email, seed.users.admin.password);

    // Approve first, so the rejection is a real state transition and not a no-op.
    const approve = await page.request.post(`/api/v1/admin/landlords/${landlordId}/verify`, {
      data: { verificationLevel: "id_verified", note: "interim — e2e" },
    });
    expect(approve.ok()).toBe(true);
    await waitForDb<VerificationRow>(
      `SELECT user_id, verification_level, verified_at FROM landlord_profiles WHERE user_id = $1`,
      [landlordId],
      r => r[0]?.verification_level === "id_verified",
      { what: "the interim approval" },
    );

    await page.goto(`/admin/landlords/${landlordId}`);
    await page.getByRole("button", { name: /^unverified$/i }).click();
    await page.getByLabel(/reason|note/i).fill("Deed does not match applicant — e2e");
    await page.getByRole("button", { name: /save|update|verify/i }).first().click();

    await waitForDb<VerificationRow>(
      `SELECT user_id, verification_level, verified_at FROM landlord_profiles WHERE user_id = $1`,
      [landlordId],
      r => r[0]?.verification_level === "unverified",
      { what: "the rejection to be persisted" },
    );

    const status = await page.request.get(`/api/v1/landlords/${landlordId}/verification-status`);
    expect((await status.json()).level).toBe("unverified");
  });

  test("a non-admin cannot review or decide, including by direct URL", async ({ page, seed }) => {
    const landlordId = seed.users.landlord.id!;

    const login = new LoginPage(page);
    await login.goto();
    await login.login(seed.users.tenant.email, seed.users.tenant.password);

    // Direct URL to the review surface.
    await page.goto(`/admin/landlords/${landlordId}`);

    // A hidden button is not access control — the API itself must refuse.
    const decide = await page.request.post(`/api/v1/admin/landlords/${landlordId}/verify`, {
      data: { verificationLevel: "premium", note: "should be refused — e2e" },
    });
    expect([401, 403]).toContain(decide.status());

    const queue = await page.request.get(`/api/kyc/admin?status=pending`);
    expect([401, 403]).toContain(queue.status());

    // And nothing changed.
    expect(await verificationLevelOf(landlordId)).toBe("unverified");
  });

  test("a verification document is visible to the reviewing admin and to nobody else", async ({
    page,
    seed,
  }) => {
    const landlordId = seed.users.landlord.id!;
    const key = `e2e-verification-doc-${Date.now()}`;
    await seedVerificationDocument(landlordId, key);

    const submissions = await dbQuery<{ id: string }>(
      `SELECT id FROM kyc_documents WHERE front_image_key = $1`,
      [key],
    );
    expect(submissions).toHaveLength(1);
    const submissionId = submissions[0].id;

    // Tenant: refused.
    const tenantLogin = new LoginPage(page);
    await tenantLogin.goto();
    await tenantLogin.login(seed.users.tenant.email, seed.users.tenant.password);
    const asTenant = await page.request.get(`/api/kyc/admin/${submissionId}`);
    expect([401, 403, 404]).toContain(asTenant.status());

    // Admin: visible.
    await page.context().clearCookies();
    const adminLogin = new LoginPage(page);
    await adminLogin.goto();
    await adminLogin.login(seed.users.admin.email, seed.users.admin.password);
    const asAdmin = await page.request.get(`/api/kyc/admin/${submissionId}`);
    expect(asAdmin.ok()).toBe(true);

    await dbQuery(`DELETE FROM kyc_documents WHERE front_image_key = $1`, [key]);
  });

  test("the decision is recorded in the audit trail", async ({ page, seed }) => {
    const landlordId = seed.users.landlord.id!;
    const note = `audit-trail-check-${Date.now()}`;

    const login = new LoginPage(page);
    await login.goto();
    await login.login(seed.users.admin.email, seed.users.admin.password);

    const decide = await page.request.post(`/api/v1/admin/landlords/${landlordId}/verify`, {
      data: { verificationLevel: "id_verified", note },
    });
    expect(decide.ok()).toBe(true);

    const entries = await waitForDb<{ event_type: string; actor_type: string; metadata: Record<string, unknown> }>(
      `SELECT event_type, actor_type, metadata
         FROM audit_log
        WHERE event_type = 'LANDLORD_VERIFICATION_UPDATED'
          AND metadata->>'note' = $1`,
      [note],
      rows => rows.length > 0,
      { what: "the verification decision to reach the audit log" },
    );
    expect(entries[0].actor_type).toBe("admin");
    expect(entries[0].metadata.landlordId).toBe(landlordId);
    expect(entries[0].metadata.level).toBe("id_verified");
    // audit_log is append-only (rules in migration 008), so there is nothing to clean up.
  });

  /**
   * Known gap, deliberately encoded rather than asserted away.
   *
   * Writing this spec turned up that nothing on the server currently consumes
   * `landlord_profiles.verification_level` as a gate: an unverified landlord can
   * call every landlord endpoint an approved one can. Verification is displayed
   * but not enforced, which is exactly the failure mode #1432 is about.
   *
   * Un-skip once a gate exists; the assertion below is the contract it must meet.
   */
  test.fixme(
    "an unverified landlord is prevented from listing a property, not merely un-badged",
    async ({ page, seed }) => {
      const login = new LoginPage(page);
      await login.goto();
      await login.login(seed.users.landlord.email, seed.users.landlord.password);

      expect(await verificationLevelOf(seed.users.landlord.id!)).toBe("unverified");

      const create = await page.request.post("/api/landlord/properties", {
        data: {
          title: "Should be refused while unverified — e2e",
          address: "1 Test Street, Lagos",
          city: "Lagos",
          area: "Ikoyi",
          bedrooms: 2,
          bathrooms: 1,
          annualRentNgn: 4_000_000,
        },
      });
      expect([401, 403]).toContain(create.status());
    },
  );
});
