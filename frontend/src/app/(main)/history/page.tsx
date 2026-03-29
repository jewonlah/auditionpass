"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Clock,
  CheckCircle,
  XCircle,
  Calendar,
  Building2,
  Loader2,
  Inbox,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { useAuth } from "@/hooks/useAuth";
import { formatDate, formatDday, getDday } from "@/lib/utils";

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

export default function HistoryPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.push("/login");
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
      <h1 className="text-lg font-bold mb-1">지원 이력</h1>
      <p className="text-sm text-gray-500 mb-6">
        총 {applications.length}건의 지원 이력
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

function ApplicationCard({ application }: { application: ApplicationRecord }) {
  const { audition } = application;
  const dday = getDday(audition.deadline);
  const isExpired = dday !== null && dday < 0;

  return (
    <Link
      href={`/audition/${audition.id}`}
      className={`block rounded-xl bg-white p-4 shadow-sm transition-shadow hover:shadow-md ${
        isExpired ? "opacity-60" : ""
      }`}
    >
      {/* 상단: 제목 + 상태 */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-semibold text-sm leading-snug flex-1 min-w-0 truncate">
          {audition.title}
        </h3>
        {application.email_sent ? (
          <Badge variant="success" className="shrink-0">
            <CheckCircle size={12} className="mr-1" />
            발송완료
          </Badge>
        ) : (
          <Badge variant="danger" className="shrink-0">
            <XCircle size={12} className="mr-1" />
            발송실패
          </Badge>
        )}
      </div>

      {/* 중단: 메타 정보 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
        {audition.company && (
          <span className="flex items-center gap-1">
            <Building2 size={12} />
            {audition.company}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Clock size={12} />
          지원일: {formatDate(application.created_at)}
        </span>
        {audition.deadline && (
          <span className="flex items-center gap-1">
            <Calendar size={12} />
            {isExpired ? "마감됨" : formatDday(audition.deadline)}
          </span>
        )}
      </div>

      {/* 하단: 장르 배지 */}
      <div className="mt-2">
        <Badge>{audition.genre}</Badge>
      </div>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      <Inbox size={48} className="mb-3 opacity-50" />
      <p className="text-sm font-medium mb-1">아직 지원한 오디션이 없습니다</p>
      <p className="text-xs mb-4">홈에서 오디션을 찾아 지원해보세요</p>
      <Link
        href="/"
        className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover transition-colors"
      >
        오디션 둘러보기
      </Link>
    </div>
  );
}
