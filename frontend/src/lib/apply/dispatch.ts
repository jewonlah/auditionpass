import type { SupabaseClient } from "@supabase/supabase-js";
import { deliverJob, type DeliveryJob } from "./delivery";
import { sendPreparedEmail, deliveryMode } from "@/lib/email/sendApplicationEmail";

/** Call only after verifying the session and ownership. Never accept jobs/payloads from the browser. */
export async function dispatchApplication(db: SupabaseClient, job: DeliveryJob, userId: string) {
  if (job.mode !== deliveryMode()) return "expired" as const;
  return deliverJob(job, {
    send: sendPreparedEmail,
    recordProvider: async (id) => {
      const { error } = await db.from("application_delivery_jobs").update({ provider_id: id }).eq("id", job.id);
      if (error) throw error;
    },
    complete: async () => {
      const { data, error } = await db.from("applications")
        .update({ status: "sent", email_sent: true, sent_at: job.created_at })
        .eq("id", job.application_id).eq("user_id", userId).select("id").single();
      if (error || !data) throw error ?? new Error("지원 기록이 없습니다.");
      // Once receipt + status are durable, discard the private snapshot.
      const { error: cleanupError } = await db.from("application_delivery_jobs").update({ payload: null }).eq("id", job.id);
      if (cleanupError) console.error("[apply] delivery payload cleanup failed", { jobId: job.id });
    },
  });
}
