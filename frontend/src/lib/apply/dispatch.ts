import type { SupabaseClient } from "@supabase/supabase-js";
import { canReplayDelivery, type DeliveryJob, type DeliveryResult } from "./delivery";
import { sendPreparedEmail, deliveryMode } from "@/lib/email/sendApplicationEmail";

/** Server-only; acquisition and account deletion share the same database lock. */
export async function dispatchApplication(db: SupabaseClient, requested: DeliveryJob, userId: string): Promise<DeliveryResult> {
  if (requested.mode !== deliveryMode()) return "expired";
  const { data, error } = await db.rpc("acquire_application_dispatch", { p_job: requested.id, p_user: userId });
  if (error || !data) return error?.message.includes("MANUAL_REVIEW") ? "expired" : "pending";
  const job = data as DeliveryJob;
  if (job.mode !== deliveryMode() || (!job.provider_id && !canReplayDelivery(job))) return "expired";
  let receipt = job.provider_id;
  try {
    receipt ??= await sendPreparedEmail(job.payload!, `application/${job.id}`);
    const { error: receiptError } = await db.rpc("record_application_receipt", { p_job: job.id, p_provider: receipt });
    if (receiptError) throw receiptError;
    return "sent";
  } catch {
    // Never create a new key for an ambiguous send. Preserve the exact original bytes.
    await db.from("application_delivery_jobs").update({ state: "uncertain", ...(receipt ? { provider_id: receipt } : {}) }).eq("id", job.id).eq("state", "dispatching");
    return "pending";
  }
}
