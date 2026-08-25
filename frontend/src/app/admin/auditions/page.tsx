import { notFound, redirect } from "next/navigation";
import { getAdminGate } from "@/lib/admin/auth";
import { AuditionsClient } from "./AuditionsClient";

export const dynamic = "force-dynamic";

export default async function AdminAuditionsPage() {
  const gate = await getAdminGate();
  if (gate.status === "anon") redirect("/login?returnTo=/admin/auditions");
  if (gate.status === "forbidden") notFound();

  return <AuditionsClient />;
}
