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
      className="block rounded-xl bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-base truncate">{audition.title}</h3>
          {audition.company && (
            <p className="text-sm text-gray-500 mt-0.5">{audition.company}</p>
          )}
        </div>
        <Badge variant={ddayVariant}>{formatDday(audition.deadline)}</Badge>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Badge>{audition.genre}</Badge>
        {audition.source_name && (
          <span className="text-xs text-gray-400">{audition.source_name}</span>
        )}
      </div>
    </Link>
  );
}
