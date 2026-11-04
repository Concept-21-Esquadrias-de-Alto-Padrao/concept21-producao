import { afterEach, describe, expect, it, vi } from "vitest";
import { checkCorporateAccess } from "./corporate-access-server";

const originalEnabled = process.env.CORPORATE_GATE_ENABLED;
const originalUrl = process.env.PORTAL_CORPORATE_ACCESS_URL;

afterEach(() => {
  if (originalEnabled === undefined) delete process.env.CORPORATE_GATE_ENABLED;
  else process.env.CORPORATE_GATE_ENABLED = originalEnabled;
  if (originalUrl === undefined) delete process.env.PORTAL_CORPORATE_ACCESS_URL;
  else process.env.PORTAL_CORPORATE_ACCESS_URL = originalUrl;
  vi.unstubAllGlobals();
});

describe("corporate access check", () => {
  it("denies a revoked link and fails closed when Portal is unavailable", async () => {
    process.env.CORPORATE_GATE_ENABLED = "true";
    process.env.PORTAL_CORPORATE_ACCESS_URL = "https://portal.example.com/api/internal/module-access";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 403 })));
    expect(await checkCorporateAccess("test-token")).toBe("revoked");

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await checkCorporateAccess("test-token")).toBe("unavailable");
  });

  it("sends the module token only to the configured exact HTTPS endpoint", async () => {
    process.env.CORPORATE_GATE_ENABLED = "true";
    process.env.PORTAL_CORPORATE_ACCESS_URL = "http://portal.example.com/api/internal/module-access";
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await checkCorporateAccess("test-token")).toBe("unavailable");
    expect(fetchMock).not.toHaveBeenCalled();

    process.env.PORTAL_CORPORATE_ACCESS_URL = "https://portal.example.com/api/internal/module-access";
    expect(await checkCorporateAccess("test-token")).toBe("allowed");
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://portal.example.com/api/internal/module-access"),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
        body: JSON.stringify({ moduleKey: "production" }),
        cache: "no-store",
      }),
    );
  });
});
