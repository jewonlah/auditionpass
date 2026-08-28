import { notFound, redirect } from "next/navigation";
import { getAdminGate } from "@/lib/admin/auth";
import { UsersClient } from "./UsersClient";

export const dynamic = "force-dynamic";

// 가입자 현황 (2026-08-28 신설). 그전까지 누가 가입했는지 볼 화면이 없었다.
export default async function AdminUsersPage() {
  const gate = await getAdminGate();
  if (gate.status === "anon") redirect("/login?returnTo=/admin/users");
  if (gate.status === "forbidden") notFound();

  return <UsersClient />;
}
