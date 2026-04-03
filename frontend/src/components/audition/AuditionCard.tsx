import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { formatDday, getDday } from "@/lib/utils";
import type { Audition } from "@/types";

interface AuditionCardProps {
  audition: Audition;
}

export function AuditionCard({ audition }: AuditionCardProps) {
  const dday = getDday(audition.deadline);
  const ddayVariant =
    dday !== null && dday <= 3 ? "danger" : dday !== null && dday <= 7 ? "warning" : "default";

  return (
    <Link
      href={`/audition/${audition.id}`}
      className="block rounded-xl bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
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
      <div className="mt-3 flex items-center gap-2">
        <Badge>{audition.genre}</Badge>
        {audition.apply_type === "email" ? (
          <Badge variant="success">원클릭 지원</Badge>
        ) : (
          <Badge className="bg-gray-100 text-gray-500">사이트 지원</Badge>
        )}
      </div>
    </Link>
  );
}
