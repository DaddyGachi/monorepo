import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import { errorHandler } from "../middleware/errorHandler.js";
import {
  createAdminLandlordVerificationRouter,
  createLandlordVerificationRouter,
} from "./landlordVerification.js";
import {
  setLandlordVerification,
  getLandlordVerificationPublic,
} from "../services/landlordVerificationService.js";

vi.mock("../services/landlordVerificationService.js", () => ({
  setLandlordVerification: vi.fn(),
  getLandlordVerificationPublic: vi.fn(),
}));

const authState = vi.hoisted(() => ({
  mode: "authenticated" as "authenticated" | "no-token",
  user: {
    id: "admin-user-1",
    email: "admin@example.com",
    name: "Admin",
    role: "admin" as string,
  },
}));

vi.mock("../middleware/auth.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../middleware/auth.js")>();
  const { AppError } = await import("../errors/AppError.js");
  const { ErrorCode } = await import("../errors/errorCodes.js");
  return {
    ...original,
    authenticateToken: (req: any, _res: any, next: any) => {
      if (authState.mode === "no-token") {
        next(new AppError(ErrorCode.UNAUTHORIZED, 401, "Authentication token required"));
        return;
      }
      req.user = authState.user;
      next();
    },
  };
});

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.requestId = "test-request-id";
    next();
  });
  app.use("/api/v1/landlords", createLandlordVerificationRouter());
  app.use("/api/v1/admin", createAdminLandlordVerificationRouter());
  app.use(errorHandler);
  return app;
}

describe("Landlord Verification Routes", () => {
  beforeEach(() => {
    vi.mocked(setLandlordVerification).mockReset().mockResolvedValue(undefined);
    vi.mocked(getLandlordVerificationPublic).mockReset();

    authState.mode = "authenticated";
    authState.user = { id: "admin-user-1", email: "admin@example.com", name: "Admin", role: "admin" };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // POST /api/v1/admin/landlords/:id/verify
  // ---------------------------------------------------------------------------
  describe("POST /api/v1/admin/landlords/:id/verify", () => {
    it("verifies a landlord as an admin", async () => {
      const res = await request(buildApp())
        .post("/api/v1/admin/landlords/landlord-1/verify")
        .send({ verificationLevel: "id_verified", note: "ID checked in person" });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(setLandlordVerification).toHaveBeenCalledWith(
        expect.objectContaining({ user: expect.objectContaining({ id: "admin-user-1" }) }),
        "landlord-1",
        "id_verified",
        "ID checked in person",
      );
    });

    it("accepts the super_admin role", async () => {
      authState.user = { id: "super-1", email: "super@example.com", name: "Super", role: "super_admin" };

      const res = await request(buildApp())
        .post("/api/v1/admin/landlords/landlord-1/verify")
        .send({ verificationLevel: "premium", note: "Fully vetted" });

      expect(res.status).toBe(200);
      expect(setLandlordVerification).toHaveBeenCalled();
    });

    it("rejects a non-admin authenticated user", async () => {
      authState.user = { id: "tenant-1", email: "tenant@example.com", name: "Tenant", role: "tenant" };

      const res = await request(buildApp())
        .post("/api/v1/admin/landlords/landlord-1/verify")
        .send({ verificationLevel: "id_verified", note: "attempted self-verify" });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
      expect(setLandlordVerification).not.toHaveBeenCalled();
    });

    it("rejects an unauthenticated request", async () => {
      authState.mode = "no-token";

      const res = await request(buildApp())
        .post("/api/v1/admin/landlords/landlord-1/verify")
        .send({ verificationLevel: "id_verified", note: "test" });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
      expect(setLandlordVerification).not.toHaveBeenCalled();
    });

    it("rejects a request missing the required note field", async () => {
      const res = await request(buildApp())
        .post("/api/v1/admin/landlords/landlord-1/verify")
        .send({ verificationLevel: "id_verified" });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(setLandlordVerification).not.toHaveBeenCalled();
    });

    it("rejects a request with an empty note", async () => {
      const res = await request(buildApp())
        .post("/api/v1/admin/landlords/landlord-1/verify")
        .send({ verificationLevel: "id_verified", note: "" });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects a request with an invalid verificationLevel", async () => {
      const res = await request(buildApp())
        .post("/api/v1/admin/landlords/landlord-1/verify")
        .send({ verificationLevel: "definitely_verified", note: "test" });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(setLandlordVerification).not.toHaveBeenCalled();
    });

    it("propagates a service failure as a 500", async () => {
      vi.mocked(setLandlordVerification).mockRejectedValue(new Error("DB not available"));

      const res = await request(buildApp())
        .post("/api/v1/admin/landlords/landlord-1/verify")
        .send({ verificationLevel: "id_verified", note: "test" });

      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe("INTERNAL_ERROR");
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/landlords/:id/verification-status
  // ---------------------------------------------------------------------------
  describe("GET /api/v1/landlords/:id/verification-status", () => {
    it("returns the verification status for a landlord", async () => {
      vi.mocked(getLandlordVerificationPublic).mockResolvedValue({
        level: "id_verified",
        verifiedAt: "2024-01-01T00:00:00.000Z",
      });

      const res = await request(buildApp()).get("/api/v1/landlords/landlord-1/verification-status");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ level: "id_verified", verifiedAt: "2024-01-01T00:00:00.000Z" });
      expect(getLandlordVerificationPublic).toHaveBeenCalledWith("landlord-1");
    });

    it("returns 404 when the landlord does not exist", async () => {
      vi.mocked(getLandlordVerificationPublic).mockResolvedValue(null);

      const res = await request(buildApp()).get("/api/v1/landlords/no-such-landlord/verification-status");

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    });

    it("does not require authentication", async () => {
      authState.mode = "no-token";
      vi.mocked(getLandlordVerificationPublic).mockResolvedValue({
        level: "unverified",
        verifiedAt: null,
      });

      const res = await request(buildApp()).get("/api/v1/landlords/landlord-1/verification-status");

      expect(res.status).toBe(200);
      expect(res.body.level).toBe("unverified");
    });
  });
});
