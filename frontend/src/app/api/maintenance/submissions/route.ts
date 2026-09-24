import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/service";
export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : "";
  const actual = req.headers.get("authorization") ?? "";
  if (!expected || Buffer.byteLength(actual) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { error } = await createServiceRoleClient().rpc("cleanup_submission_preparations");
  return NextResponse.json({ success: !error }, { status: error ? 503 : 200 });
}
