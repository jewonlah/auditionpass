import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { TrustBadge } from "@/components/audition/TrustBadge";
import { formatDday, getDday } from "@/lib/utils";
import type { Audition } from "@/types";
import { BookmarkButton } from "./Bookmarks";

interface AuditionCardProps {
  audition: Audition;
}

export function AuditionCard({ audition }: AuditionCardProps) {
  const dday = getDday(audition.deadline);
  const ddayVariant =
    dday !== null && dday <= 3 ? "danger" : dday !== null && dday <= 7 ? "warning" : "default";

  const isPublic = audition.is_public ?? (audition.is_active && (!audition.review_status || ["auto", "approved"].includes(audition.review_status)));
  const content = (
    <div
      className="block rounded-xl bg-white p-5 pr-14 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-lg leading-snug line-clamp-2">{audition.title}</h3>
          {audition.company && (
            <p className="text-sm text-gray-500 mt-0.5">{audition.company}</p>
          )}
        </div>
        <Badge variant={ddayVariant}>{formatDday(audition.deadline)}</Badge>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge>{audition.category ?? audition.genre}</Badge>
        {audition.application_ready === true ? (
          <Badge>원클릭 지원</Badge>
        ) : (
          <Badge className="bg-gray-100 text-gray-500">원문 접수 확인</Badge>
        )}
        {isPublic ? <TrustBadge audition={audition} /> : <Badge>게시 종료</Badge>}
      </div>
    </div>
  );
  return <article className="relative">
    {isPublic ? <Link href={`/audition/${audition.id}`} className="block">{content}</Link> : content}
    <div className="absolute right-1 top-1"><BookmarkButton auditionId={audition.id} /></div>
    </article>;
}
