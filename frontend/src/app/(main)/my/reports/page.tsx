"use client";

// 내 신고 내역 (36 §4) — 유저에게는 접수됨/조치됨/유지됨 3상태만 보여준다.
// 운영자의 내부 처리(게시중지·격리·메모)는 노출하지 않는다.
// reports는 RLS로 본인 행만 조회되므로 클라이언트에서 직접 읽는다.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, ShieldAlert } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import { REASON_MAP, STATUS_LABEL, type ReportStatus } from "@/lib/reports";

interface MyReport {
  id: number;
  audition_id: string;
  reason: string;
  status: ReportStatus;
  created_at: string;
  auditions: { title: string } | null;
}

const STATUS_STYLE: Record<ReportStatus, string> = {
  received: "bg-indigo-50 text-primary",
  actioned: "bg-emerald-50 text-emerald-600",
  dismissed: "bg-gray-100 text-gray-500",
};

const STATUS_HINT: Record<ReportStatus, string> = {
  received: "확인 중입니다",
  actioned: "확인 후 공고를 조치했습니다",
  dismissed: "확인했지만 문제가 없어 그대로 두었습니다",
};

export default function MyReportsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [reports, setReports] = useState<MyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login?returnTo=%2Fmy%2Freports");
      return;
    }

    async function fetchReports() {
      const supabase = createClient();
      const { data, error: queryError } = await supabase
        .from("reports")
        .select("id, audition_id, reason, status, created_at, auditions(title)")
        .order("created_at", { ascending: false });

      if (queryError) {
        setError("신고 내역을 불러오지 못했습니다.");
      } else {
        setReports((data ?? []) as unknown as MyReport[]);
      }
      setLoading(false);
    }

    fetchReports();
  }, [user, authLoading, router]);

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="pb-4">
      <button
        onClick={() => router.back()}
        className="mb-4 -ml-1 flex items-center gap-1 text-sm text-gray-400 transition-colors hover:text-gray-600"
      >
        <ArrowLeft size={18} />
        <span>뒤로가기</span>
      </button>

      <h1 className="mb-1 text-lg font-bold">내 신고 내역</h1>
      <p className="mb-4 text-xs text-gray-400">
        접수된 신고는 운영자가 직접 확인합니다. 위험 신고는 24시간 안에 처리합니다.
      </p>

      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
      )}

      {!error && reports.length === 0 && (
        <div className="rounded-2xl bg-white py-14 text-center shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
          <ShieldAlert size={28} className="mx-auto mb-3 text-gray-300" />
          <p className="text-sm text-gray-400">아직 신고한 공고가 없습니다.</p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {reports.map((r) => (
          <div
            key={r.id}
            className="rounded-xl bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,0.04)]"
          >
            <div className="mb-1.5 flex items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${STATUS_STYLE[r.status]}`}
              >
                {STATUS_LABEL[r.status]}
              </span>
              <span className="text-[11px] text-gray-400">
                {r.created_at.slice(0, 10)}
              </span>
            </div>

            <Link
              href={`/audition/${r.audition_id}`}
              className="line-clamp-2 text-sm font-semibold text-gray-900 hover:text-primary"
            >
              {r.auditions?.title ?? "(삭제된 공고)"}
            </Link>

            <p className="mt-1 text-xs text-gray-500">
              사유: {REASON_MAP.get(r.reason)?.label ?? r.reason}
            </p>
            <p className="mt-0.5 text-xs text-gray-400">{STATUS_HINT[r.status]}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
