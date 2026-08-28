import { notFound, redirect } from "next/navigation";
import { getAdminGate } from "@/lib/admin/auth";
import { CandidatesClient } from "./CandidatesClient";

export const dynamic = "force-dynamic";

// 소스 후보 검수 (2026-08-28 신설). 기존 어드민에 이 화면이 없어 604건이 방치돼 있었다.
export default async function AdminCandidatesPage() {
  const gate = await getAdminGate();
  if (gate.status === "anon") redirect("/login?returnTo=/admin/candidates");
  if (gate.status === "forbidden") notFound();

  return <CandidatesClient />;
}
