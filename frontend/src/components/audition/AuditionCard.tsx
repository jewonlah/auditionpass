import Link from "next/link";
import { formatDday, getDday } from "@/lib/utils";
import type { Audition } from "@/types";
import { Clock, Building2 } from "lucide-react";

interface AuditionCardProps {
  audition: Audition;
}

const GENRE_COLORS: Record<string, string> = {
  배우: "bg-indigo-50 text-indigo-700 border border-indigo-200",
  모델: "bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200",
  기타: "bg-slate-50 text-slate-600 border border-slate-200",
};

export function AuditionCard({ audition }: AuditionCardProps) {
  const dday = getDday(audition.deadline);
  const isUrgent = dday !== null && dday <= 3;
  const isWarning = dday !== null && dday <= 7;

  return (
    <Link
      href={`/audition/${audition.id}`}
      className="group block rounded-2xl bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_4px_12px_rgba(99,102,241,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(99,102,241,0.12),0_8px_24px_rgba(0,0,0,0.06)]"
    >
      {/* 상단: 배지 영역 */}
      <div className="flex items-center gap-1.5 mb-2.5">
        <span
          className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold ${GENRE_COLORS[audition.genre] ?? GENRE_COLORS["기타"]}`}
        >
          {audition.genre}
        </span>
        {audition.apply_type === "email" ? (
          <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-600 border border-emerald-200">
            원클릭 지원
          </span>
        ) : (
          <span className="inline-flex items-center rounded-md bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-400 border border-gray-150">
            사이트 지원
          </span>
        )}
      </div>

      {/* 제목 — 2줄 제한 */}
      <h3 className="font-bold text-[15px] leading-snug text-gray-900 line-clamp-2 group-hover:text-primary transition-colors">
        {audition.title}
      </h3>

      {/* 하단: 주최사 + D-day */}
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 min-w-0">
          {audition.company && (
            <span className="flex items-center gap-1 text-[13px] text-gray-400 truncate">
              <Building2 size={13} className="shrink-0" />
              {audition.company}
            </span>
          )}
          {audition.source_name && (
            <span className="text-[11px] text-gray-300 shrink-0">
              · {audition.source_name}
            </span>
          )}
        </div>

        <span
          className={`shrink-0 flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-bold ${
            isUrgent
              ? "bg-red-50 text-red-600"
              : isWarning
                ? "bg-amber-50 text-amber-600"
                : "bg-gray-50 text-gray-500"
          }`}
        >
          <Clock size={12} />
          {formatDday(audition.deadline)}
        </span>
      </div>
    </Link>
  );
}
