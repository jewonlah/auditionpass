import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createServiceRoleClient } from "@/lib/supabase/service";

export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook unavailable" }, { status: 503 });
  let event;
  const eventId = req.headers.get("svix-id") ?? "";
  try {
    event = new Resend(process.env.RESEND_API_KEY).webhooks.verify({ payload: await req.text(), webhookSecret: secret,
      headers: { id: eventId, timestamp: req.headers.get("svix-timestamp") ?? "", signature: req.headers.get("svix-signature") ?? "" } });
  } catch { return NextResponse.json({ error: "Invalid signature" }, { status: 400 }); }
  if (event.type !== "email.delivered" && event.type !== "email.bounced") return NextResponse.json({ received: true });
  const { error } = await createServiceRoleClient().rpc("record_application_event", { p_event: eventId,
    p_provider: event.data.email_id, p_kind: event.type === "email.delivered" ? "delivered" : "bounced", p_occurred: event.created_at });
  if (error) return NextResponse.json({ error: "Receipt unavailable" }, { status: 503 });
  return NextResponse.json({ received: true });
}
