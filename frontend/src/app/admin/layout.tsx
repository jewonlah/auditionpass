import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAdminGate } from "@/lib/admin/auth";

export const metadata: Metadata = {
  title: "오디션패스 어드민",
  robots: { index: false, follow: false },
};

// 1인 운영자용 어드민 셸 (39_admin.md) — 데스크톱 우선.
// 게이트: 세션 + ADMIN_EMAILS 화이트리스트. 페이지·API도 각자 재검증한다(이중 게이트).
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const gate = await getAdminGate();
  if (gate.status === "anon") redirect("/login?returnTo=/admin");
  if (gate.status === "forbidden") notFound();
  const admin = gate.email;

  return (
    <div className="flex min-h-screen w-full bg-[#FAFAF7] text-[#141414]">
      <aside className="hidden w-52 shrink-0 flex-col border-r border-[#E7E5E0] bg-white lg:flex">
        <div className="px-5 pt-5 pb-3">
          <span className="font-mono text-[10.5px] font-semibold tracking-[0.08em] text-primary uppercase">
            Auditionpass
          </span>
          <div className="mt-0.5 text-base font-extrabold tracking-tight">어드민</div>
        </div>
        <nav className="flex flex-col gap-0.5 px-2.5 py-3 text-[13.5px] font-semibold text-[#4A4A48]">
          <Link href="/admin" className="rounded-lg px-3 py-2 hover:bg-[#F3F4F6]">
            오늘
          </Link>
          <Link href="/admin/queue" className="rounded-lg px-3 py-2 hover:bg-[#F3F4F6]">
            검수 큐
          </Link>
          <Link href="/admin/reports" className="rounded-lg px-3 py-2 hover:bg-[#F3F4F6]">
            신고
          </Link>
          <Link href="/admin/auditions" className="rounded-lg px-3 py-2 hover:bg-[#F3F4F6]">
            공고 검색·조치
          </Link>
          <Link href="/admin/sources" className="rounded-lg px-3 py-2 hover:bg-[#F3F4F6]">
            소스·차단
          </Link>
          <span className="cursor-default rounded-lg px-3 py-2 text-[#C9C7C1]">인테이크 (R2)</span>
          <span className="cursor-default rounded-lg px-3 py-2 text-[#C9C7C1]">발송 로그 (M2)</span>
        </nav>
        <div className="mt-auto border-t border-[#F0F0EE] px-5 py-3.5 text-[11.5px] leading-relaxed text-[#8A8A86]">
          {admin}
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="border-b border-[#E7E5E0] bg-white px-4 py-2 text-[12px] text-[#8A8A86] lg:hidden">
          모바일은 모니터링·긴급 조치 전용 — 게시 승인은 데스크톱에서 (39 §4)
        </div>
        {children}
      </div>
    </div>
  );
}
