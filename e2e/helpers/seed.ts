import { Pool } from "pg";
import crypto from "crypto";

export interface TestUsers {
  tenant: { email: string; password: string; id?: string };
  landlord: { email: string; password: string; id?: string };
  admin: { email: string; password: string; id?: string };
  whistleblower: { email: string; password: string; id?: string };
  inspector: { email: string; password: string; id?: string };
}

export interface SeedResult {
  users: TestUsers;
  listingId: string;
  /** The whistleblower_listings listing_id (approved, linked to landlord). */
  approvedListingId: string;
  /** The landlord_properties id (approved, linked to the listing). */
  landlordPropertyId: string;
  /** An inspection job ID in inspection_jobs (available). */
  inspectionJobId: string;
  /** A property inspection ID in property_inspections (in_progress, assigned to inspector). */
  propertyInspectionId: string;
  runId: string;
}

const DB_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL!;

export async function seedTestData(): Promise<SeedResult> {
  const pool = new Pool({ connectionString: DB_URL });
  const runId = `e2e_${crypto.randomBytes(6).toString("hex")}`;

  const users: TestUsers = {
    tenant: { email: `tenant_${runId}@shelterflex.test`, password: "Test1234!" },
    landlord: { email: `landlord_${runId}@shelterflex.test`, password: "Test1234!" },
    admin: { email: `admin_${runId}@shelterflex.test`, password: "Test1234!" },
    whistleblower: { email: `wb_${runId}@shelterflex.test`, password: "Test1234!" },
    inspector: { email: `inspector_${runId}@shelterflex.test`, password: "Test1234!" },
  };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const [role, u] of Object.entries(users)) {
      const { rows } = await client.query(
        `INSERT INTO users (email, role, created_at)
         VALUES ($1, $2, NOW())
         RETURNING id`,
        [u.email, role],
      );
      (users as any)[role].id = rows[0].id;
    }

    const { rows: listing } = await client.query(
      `INSERT INTO properties (title, address, monthly_rent_ngn, status, landlord_id, created_at)
       VALUES ($1, $2, $3, 'active', $4, NOW())
       RETURNING id`,
      [
        `Test Property ${runId}`,
        "123 Test Street, Lagos, NG",
        500_000,
        (users.landlord as any).id,
      ],
    );

    // Approved KYC for landlord (required by listing approval gate)
    await client.query(
      `INSERT INTO kyc_documents (user_id, document_type, front_image_key, status, attempt_count)
       VALUES ($1, 'national_id', 'test-key', 'approved', 1)`,
      [(users.landlord as any).id],
    );

    // Approved whistleblower listing linked to the landlord
    const photos = JSON.stringify([
      "https://example.com/photo1.jpg",
      "https://example.com/photo2.jpg",
      "https://example.com/photo3.jpg",
    ]);
    const { rows: wlRow } = await client.query(
      `INSERT INTO whistleblower_listings
         (whistleblower_id, address, city, area, bedrooms, bathrooms,
          annual_rent_ngn, photos, status, reviewed_by, reviewed_at)
       VALUES ($1, $2, 'Lagos', 'Victoria Island', 3, 2,
               6000000, $3::jsonb, 'approved', $1, NOW())
       RETURNING listing_id`,
      [(users.landlord as any).id, "123 Test Street, Victoria Island, Lagos", photos],
    );

    // Landlord property record linked to the approved listing
    const { rows: lpRow } = await client.query(
      `INSERT INTO landlord_properties
         (landlord_id, title, address, city, area, bedrooms, bathrooms,
          annual_rent_ngn, negotiated_landlord_rate_ngn, outright_price_ngn,
          installment_base_price_ngn, photos, amenities, status, listing_id)
       VALUES ($1, $2, $3, 'Lagos', 'Victoria Island', 3, 2,
               6000000, 5500000, 7000000, 8000000,
               $4::jsonb, '[]'::jsonb, 'approved', $5)
       RETURNING id`,
      [
        (users.landlord as any).id,
        `E2E Apartment ${runId}`,
        "123 Test Street, Victoria Island, Lagos",
        photos,
        wlRow.listing_id,
      ],
    );

    // Inspector profile (VERIFIED so they can accept jobs)
    await client.query(
      `INSERT INTO inspector_profiles (user_id, verification_status, bio, service_areas)
       VALUES ($1, 'VERIFIED', 'E2E test inspector', '["Lagos Mainland"]'::jsonb)`,
      [(users.inspector as any).id],
    );

    // Use the same UUID for both tables so the frontend flow works end-to-end
    const sharedJobId = crypto.randomUUID();

    // Inspection job (inspection_jobs table, for the inspectorApi path)
    await client.query(
      `INSERT INTO inspection_jobs (id, listing_id, offered_fee_ngn, status, inspector_id)
       VALUES ($1, $2, 25000, 'claimed', $3)`,
      [sharedJobId, listing[0].id, (users.inspector as any).id],
    );

    // Property inspection (property_inspections table, for the propertyInspectionApi path)
    await client.query(
      `INSERT INTO property_inspections (id, listing_id, inspector_id, status)
       VALUES ($1, $2, $3, 'in_progress')`,
      [sharedJobId, listing[0].id, (users.inspector as any).id],
    );

    await client.query("COMMIT");
    await client.release();
    await pool.end();

    return {
      users,
      listingId: listing[0].id,
      approvedListingId: wlRow.listing_id,
      landlordPropertyId: lpRow.id,
      inspectionJobId: sharedJobId,
      propertyInspectionId: sharedJobId,
      runId,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    client.release();
    await pool.end();
    throw err;
  }
}

export async function cleanupTestData(runId: string): Promise<void> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `DELETE FROM inspection_reports WHERE job_id IN (SELECT id FROM inspection_jobs WHERE listing_id IN (SELECT id FROM properties WHERE title LIKE $1))`,
      [`%${runId}%`],
    );
    await client.query(
      `DELETE FROM inspection_jobs WHERE listing_id IN (SELECT id FROM properties WHERE title LIKE $1)`,
      [`%${runId}%`],
    );
    await client.query(
      `DELETE FROM property_inspections WHERE listing_id IN (SELECT id FROM properties WHERE title LIKE $1)`,
      [`%${runId}%`],
    );
    await client.query(
      `DELETE FROM inspector_profiles WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)`,
      [`%${runId}%`],
    );
    await client.query(
      `DELETE FROM listing_applications WHERE listing_id IN
         (SELECT listing_id FROM whistleblower_listings WHERE whistleblower_id IN
           (SELECT id::text FROM users WHERE email LIKE $1))`,
      [`%${runId}%`],
    );
    await client.query(
      `DELETE FROM tenant_deals WHERE landlord_id IN
         (SELECT id::text FROM users WHERE email LIKE $1)`,
      [`%${runId}%`],
    );
    await client.query(
      `DELETE FROM landlord_properties WHERE title LIKE $1`,
      [`%${runId}%`],
    );
    await client.query(
      `DELETE FROM whistleblower_listings WHERE whistleblower_id IN
         (SELECT id::text FROM users WHERE email LIKE $1)`,
      [`%${runId}%`],
    );
    await client.query(
      `DELETE FROM kyc_documents WHERE user_id IN
         (SELECT id FROM users WHERE email LIKE $1)`,
      [`%${runId}%`],
    );
    await client.query(
      `DELETE FROM properties WHERE title LIKE $1`,
      [`%${runId}%`],
    );
    await client.query(
      `DELETE FROM users WHERE email LIKE $1`,
      [`%${runId}%`],
    );
    await client.query("COMMIT");
  } catch {
    await client.query("ROLLBACK");
  } finally {
    client.release();
    await pool.end();
  }
}
