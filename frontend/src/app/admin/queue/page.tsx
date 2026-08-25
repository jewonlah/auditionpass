import { notFound, redirect } from "next/navigation";
import { getAdminGate } from "@/lib/admin/auth";
import { QueueClient } from "./QueueClient";

export const dynamic = "force-dynamic";

export default async function AdminQueuePage() {
  const gate = await getAdminGate();
  if (gate.status === "anon") redirect("/login?returnTo=/admin/queue");
  if (gate.status === "forbidden") notFound();

  return <QueueClient />;
}
