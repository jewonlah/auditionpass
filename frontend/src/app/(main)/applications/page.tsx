"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle,
  XCircle,
  Calendar,
  Building2,
  Loader2,
  Inbox,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { useAuth } from "@/hooks/useAuth";
import { formatDday, getDday } from "@/lib/utils";

interface ApplicationAudition {
  id: string;
  title: string;
  company: string | null;
  genre: string;
  deadline: string | null;
  is_active: boolean;
}

interface ApplicationRecord {
  id: string;
  email_sent: boolean;
  sent_at: string | null;
  created_at: string;
  audition: ApplicationAudition;
}

export default function ApplicationsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.push("/login?returnTo=%2Fapplications");
      return;
    }

    async function fetchHistory() {
      try {
        const res = await fetch("/api/history");
        if (res.ok) {
          const data = await res.json();
          setApplications(data.applications);
        } else {
          setError("지원 이력을 불러오는데 실패했습니다.");
        }
      } catch {
        setError("네트워크 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    }

    fetchHistory();
  }, [user, authLoading, router]);

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <XCircle size={40} className="text-red-400 mb-3" />
        <p className="text-sm text-gray-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="pb-4">
      <h1 className="text-lg font-bold mb-1">지원</h1>
      <p className="text-sm text-gray-500 mb-6">
        지원한 오디션 {applications.length}건
        {applications.length > 0 && (
          <span className="mt-0.5 block text-xs text-gray-400">
            회신은 회원님 메일로 직접 옵니다 — 받은편지함을 확인해주세요
          </span>
        )}
      </p>

      {applications.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-3">
          {applications.map((app) => (
            <ApplicationCard key={app.id} application={app} />
          ))}
        </div>
      )}
    </div>
  );
}

/** 랜딩의 약속 "보낸 시각까지 남습니다" — 분 단위로 남긴다 */
function formatSentAt(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${hh}:${mm}`;
}

function ApplicationCard({ application }: { application: ApplicationRecord }) {
  const { audition } = application;
  const dday = getDday(audition.deadline);
  const isExpired = dday !== null && dday < 0;
  const sentAt = formatSentAt(application.sent_at ?? application.created_at);

  return (
    <Link
      href={`/audition/${audition.id}`}
      className={`block rounded-xl bg-white p-4 shadow-sm transition-shadow hover:shadow-md ${
        isExpired ? "opacity-60" : ""
      }`}
    >
      {/* 상단: 제목 + 메타 */}
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <h3 className="min-w-0 flex-1 truncate text-sm leading-snug font-semibold">
          {audition.title}
        </h3>
        {audition.deadline && (
          <span className="flex shrink-0 items-center gap-1 text-xs text-gray-400">
            <Calendar size={12} />
            {isExpired ? "마감됨" : formatDday(audition.deadline)}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
        {audition.company && (
          <span className="flex items-center gap-1">
            <Building2 size={12} />
            {audition.company}
          </span>
        )}
        <Badge>{audition.genre}</Badge>
      </div>

      {/* 타임라인 — 우리가 실제로 아는 것만 표시한다. 회신은 우리를 거치지 않는다. */}
      {application.email_sent ? (
        <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-3">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-900">
            <CheckCircle size={13} className="text-primary" />
            프로필 발송
            <span className="font-medium text-gray-500 tabular-nums">{sentAt}</span>
          </span>
          <span className="h-px w-4 bg-gray-200" aria-hidden />
          <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-900">
            <CheckCircle size={13} className="text-primary" />
            담당자 메일함 접수
          </span>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-3">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-red-600">
            <XCircle size={13} />
            발송 실패
          </span>
          <span className="text-xs text-gray-400">공고 상세에서 다시 시도해주세요</span>
        </div>
      )}
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      <Inbox size={48} className="mb-3 opacity-50" />
      <p className="text-sm font-medium mb-1">아직 지원한 오디션이 없습니다</p>
      <p className="text-xs mb-4">탐색 탭에서 오디션을 찾아 첫 지원을 시작해보세요</p>
      <Link
        href="/auditions"
        className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover transition-colors"
      >
        오디션 둘러보기
      </Link>
    </div>
  );
}
