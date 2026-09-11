export interface EmailPayload {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  attachments?: { filename: string; content: string }[];
}

export interface DeliveryJob {
  id: string;
  application_id: string;
  payload: EmailPayload | null;
  mode: "production" | "test";
  provider_id: string | null;
  created_at: string;
}

/** Resend retains keys for 24h. Stop an hour early; never resend an ambiguous older job. */
export function canReplayDelivery(job: DeliveryJob, now = Date.now()): boolean {
  const age = now - Date.parse(job.created_at);
  return !!job.payload && Number.isFinite(age) && age >= 0 && age < 23 * 3600_000;
}

export type DeliveryResult = "sent" | "pending" | "expired";

export async function deliverJob(job: DeliveryJob, deps: {
  send: (payload: EmailPayload, key: string) => Promise<string>;
  recordProvider: (id: string) => Promise<void>;
  complete: () => Promise<void>;
  now?: number;
}): Promise<DeliveryResult> {
  // A persisted provider receipt lets us repair DB state without sending, even after key expiry.
  if (!job.provider_id && !canReplayDelivery(job, deps.now)) return "expired";
  try {
    if (!job.provider_id) {
      const id = await deps.send(job.payload!, `application/${job.id}`);
      await deps.recordProvider(id);
    }
    await deps.complete();
    return "sent";
  } catch {
    // A timeout can happen after the provider accepted the email. Keep the immutable job for replay.
    return "pending";
  }
}
