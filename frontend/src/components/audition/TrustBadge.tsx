import { ShieldCheck, ShieldAlert, Shield } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { getTrustBadge, type TrustInput } from "@/lib/trust";

const VARIANT = {
  reviewed: "success",
  source_verified: "default",
  caution: "warning",
} as const;

const ICON = {
  reviewed: ShieldCheck,
  source_verified: Shield,
  caution: ShieldAlert,
};

/** 신뢰 배지 3단계 (36 §4). showHint=true면 고지 문구까지 노출(상세 화면). */
export function TrustBadge({
  audition,
  showHint = false,
}: {
  audition: TrustInput;
  showHint?: boolean;
}) {
  const badge = getTrustBadge(audition);
  const Icon = ICON[badge.level];

  if (!showHint) {
    return (
      <Badge variant={VARIANT[badge.level]} className="gap-1">
        <Icon size={11} />
        {badge.label}
      </Badge>
    );
  }

  return (
    <div>
      <Badge variant={VARIANT[badge.level]} className="gap-1">
        <Icon size={11} />
        {badge.label}
      </Badge>
      <p className="mt-1.5 text-xs leading-relaxed text-gray-500">{badge.hint}</p>
    </div>
  );
}
