import { notFound, redirect } from "next/navigation";
import { getAdminGate } from "@/lib/admin/auth";
import { IntakeClient } from "./IntakeClient";

export const dynamic = "force-dynamic";

export default async function AdminIntakePage() {
  const gate = await getAdminGate();
  if (gate.status === "anon") redirect("/login?returnTo=/admin/intake");
  if (gate.status === "forbidden") notFound();

  return <IntakeClient />;
}
