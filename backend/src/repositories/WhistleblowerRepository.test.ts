import { describe, it, expect } from "vitest";

describe("WhistleblowerRepository", () => {
  async function getRepo() {
    const mod = await import("./WhistleblowerRepository.js");
    return new mod.WhistleblowerRepository();
  }

  it("creates report", async () => {
    const repo = await getRepo();
    const data = {
      reportType: "fraud",
      description: "Suspicious activity",
      referenceCode: "REF-001",
      ipAddress: "192.168.1.1",
    };

    const report = await repo.createReport(data);

    expect(report.id).toBeDefined();
    expect(report.reportType).toBe("fraud");
    expect(report.status).toBe("pending");
  });

  it("finds report by id", async () => {
    const repo = await getRepo();
    const data = {
      reportType: "abuse",
      description: "Test",
      referenceCode: "REF-002",
      ipAddress: "10.0.0.1",
    };
    const created = await repo.createReport(data);

    const found = await repo.getReportById(created.id);

    expect(found?.id).toBe(created.id);
  });

  it("lists reports", async () => {
    const repo = await getRepo();

    await repo.createReport({
      reportType: "fraud",
      description: "Test 1",
      referenceCode: "REF-003",
      ipAddress: "10.0.0.1",
    });
    await repo.createReport({
      reportType: "abuse",
      description: "Test 2",
      referenceCode: "REF-004",
      ipAddress: "10.0.0.2",
    });

    const result = await repo.listReports({ page: 1, pageSize: 50 });

    expect(result.reports.length).toBeGreaterThanOrEqual(2);
    expect(result.total).toBeGreaterThanOrEqual(2);
  });

  it("updates report status", async () => {
    const repo = await getRepo();
    const report = await repo.createReport({
      reportType: "fraud",
      description: "Test",
      referenceCode: "REF-005",
      ipAddress: "10.0.0.1",
    });

    const updated = await repo.updateReportStatus(
      report.id,
      "resolved",
      "Investigated",
      "admin-1",
    );

    expect(updated.status).toBe("resolved");
    expect(updated.adminNote).toBe("Investigated");
  });

  it("counts recent reports by IP", async () => {
    const repo = await getRepo();
    const ip = "192.168.1.100";

    await repo.createReport({
      reportType: "fraud",
      description: "Report 1",
      referenceCode: "REF-006",
      ipAddress: ip,
    });
    await repo.createReport({
      reportType: "abuse",
      description: "Report 2",
      referenceCode: "REF-007",
      ipAddress: ip,
    });
    await repo.createReport({
      reportType: "fraud",
      description: "Report 3",
      referenceCode: "REF-008",
      ipAddress: "10.0.0.1",
    });

    const count = await repo.countRecentByIp(ip, 3600000);

    expect(count).toBe(2);
  });

  it("returns null for missing report", async () => {
    const repo = await getRepo();

    const found = await repo.getReportById("nonexistent");

    expect(found).toBeNull();
  });
});
