import { NextResponse } from "next/server";
import { checkCorporateAccess } from "@/lib/corporate-access-server";

export async function POST(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = /^Bearer [A-Za-z0-9._~-]+$/.test(header) ? header.slice(7) : "";
  if (!token) return NextResponse.json({ allowed: false }, { status: 401 });
  const result = await checkCorporateAccess(token);
  return NextResponse.json({ allowed: result === "allowed" }, {
    status: result === "allowed" ? 200 : result === "revoked" ? 403 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
