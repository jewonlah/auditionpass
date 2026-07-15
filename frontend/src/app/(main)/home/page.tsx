import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/Badge";
import { formatDday, getDday } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { Audition, Profile } from "@/types";
import { ChevronRight, Send, UserRound, Zap, Clock, Sparkles } from "lucide-react";

export const metadata: Metadata = {
  title: "홈 | 오디션패스",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** 프로필 완성도 (지원 필수 필드 + 사진) — 필수 null 체크 파생, 별도 컬럼 없음 */
function getProfileCompleteness(profile: Profile | null): number {
  const checks = [
    !!profile?.name,
    !!profile?.age,
    !!profile?.gender,
    (profile?.activity_field?.length ?? 0) > 0,
    (profile?.genre?.length ?? 0) > 0,
    (profile?.photo_urls?.length ?? 0) > 0,
  ];
  const done = checks.filter(Boolean).length;
  return Math.round((done / checks.length) * 100);
}

export default async function HomePage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // proxy가 1차 차단하지만 서버에서도 방어 (returnTo 포함)
  if (!user) redirect("/login?returnTo=%2Fhome");

  const today = new Date().toISOString().split("T")[0];
  const activeFilter = `deadline.gte.${today},deadline.is.null`;

  const [profileRes, oneClickRes, deadlineRes, applyCountRes] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      // ① 원클릭 오디션 — 이메일 지원 가능 공고 (핵심 기능, 항상 최상단)
      supabase
        .from("auditions")
        .select("*")
        .eq("is_active", true)
        .eq("apply_type", "email")
        .or(activeFilter)
        .order("deadline", { ascending: true, nullsFirst: false })
        .limit(5),
      // ③ 마감 임박 TOP
      supabase
        .from("auditions")
        .select("*")
        .eq("is_active", true)
        .not("deadline", "is", null)
        .gte("deadline", today)
        .order("deadline", { ascending: true })
        .limit(3),
      // ⑤ 지원 현황 요약
      supabase
        .from("applications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id),
    ]);

  const profile = (profileRes.data as Profile | null) ?? null;
  const oneClickAuditions = (oneClickRes.data as Audition[] | null) ?? [];
  const deadlineAuditions = (deadlineRes.data as Audition[] | null) ?? [];
  const applyCount = applyCountRes.count ?? 0;

  // ④ 내 분야 신규 공고 — 프로필 분야 기반, 없으면 전체 신규
  const myGenres = profile?.genre?.filter(Boolean) ?? [];
  let newQuery = supabase
    .from("auditions")
    .select("*")
    .eq("is_active", true)
    .or(activeFilter)
    .order("created_at", { ascending: false })
    .limit(3);
  if (myGenres.length > 0) {
    newQuery = newQuery.in("genre", myGenres);
  }
  const { data: newData } = await newQuery;
  const newAuditions = (newData as Audition[] | null) ?? [];

  const completeness = getProfileCompleteness(profile);

  return (
    <div className="pb-4">
      {/* 라지 타이틀 */}
      <div className="mb-5 pt-1">
        <h1 className="text-2xl font-bold tracking-tight">
          {profile?.name ? `${profile.name}님의 다음 무대` : "당신의 다음 무대"}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          오늘 지원할 수 있는 오디션을 모았어요
        </p>
      </div>

      {/* ① 원클릭 오디션 — 핵심 기능, 항상 최상단 */}
      <HomeSection
        icon={Zap}
        title="원클릭 오디션"
        desc="프로필로 바로 지원할 수 있는 공고"
        moreHref="/auditions?filter=원클릭지원"
      >
        {oneClickAuditions.length > 0 ? (
          <ul className="divide-y divide-gray-100">
            {oneClickAuditions.map((audition) => (
              <HomeAuditionRow
                key={audition.id}
                audition={audition}
                showOneClick
              />
            ))}
          </ul>
        ) : (
          <SectionEmpty text="지금 바로 지원 가능한 공고가 없어요" />
        )}
      </HomeSection>

      {/* ② 프로필 완성도 카드 — 완성 시 숨김 */}
      {completeness < 100 && (
        <Link
          href="/profile?returnTo=%2Fhome"
          className="mb-4 flex items-center gap-4 rounded-xl bg-white p-4 shadow-sm transition-colors active:bg-gray-50"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-indigo-50">
            <UserRound size={20} className="text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              프로필 완성도{" "}
              <span className="text-primary tabular-nums">{completeness}%</span>
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {profile
                ? "프로필을 채울수록 지원이 빨라져요"
                : "프로필을 등록하면 원클릭 지원이 열려요"}
            </p>
            <div className="mt-2 h-1 w-full rounded-full bg-gray-100">
              <div
                className="h-1 rounded-full bg-primary"
                style={{ width: `${completeness}%` }}
              />
            </div>
          </div>
          <ChevronRight size={16} className="shrink-0 text-gray-300" />
        </Link>
      )}

      {/* ③ 마감 임박 TOP */}
      <HomeSection
        icon={Clock}
        title="마감 임박 TOP"
        desc="놓치면 아까운 공고"
        moreHref="/auditions"
      >
        {deadlineAuditions.length > 0 ? (
          <ul className="divide-y divide-gray-100">
            {deadlineAuditions.map((audition) => (
              <HomeAuditionRow key={audition.id} audition={audition} />
            ))}
          </ul>
        ) : (
          <SectionEmpty text="마감 임박 공고가 없어요" />
        )}
      </HomeSection>

      {/* ④ 내 분야 신규 공고 */}
      <HomeSection
        icon={Sparkles}
        title={myGenres.length > 0 ? "내 분야 신규 공고" : "신규 공고"}
        desc={
          myGenres.length > 0
            ? `${myGenres.join(" · ")} 분야의 새 공고`
            : "방금 올라온 공고"
        }
        moreHref="/auditions"
      >
        {newAuditions.length > 0 ? (
          <ul className="divide-y divide-gray-100">
            {newAuditions.map((audition) => (
              <HomeAuditionRow key={audition.id} audition={audition} />
            ))}
          </ul>
        ) : (
          <SectionEmpty text="새로 올라온 공고가 없어요" />
        )}
      </HomeSection>

      {/* ⑤ 지원 현황 요약 */}
      <Link
        href="/applications"
        className="flex items-center gap-4 rounded-xl bg-white p-4 shadow-sm transition-colors active:bg-gray-50"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-indigo-50">
          <Send size={18} className="text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            지금까지{" "}
            <span className="text-primary tabular-nums">{applyCount}건</span>{" "}
            지원했어요
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {applyCount > 0
              ? "지원 탭에서 진행 상황을 확인하세요"
              : "첫 지원을 시작해보세요"}
          </p>
        </div>
        <ChevronRight size={16} className="shrink-0 text-gray-300" />
      </Link>
    </div>
  );
}

function HomeSection({
  icon: Icon,
  title,
  desc,
  moreHref,
  children,
}: {
  icon: React.ElementType;
  title: string;
  desc: string;
  moreHref: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-4 overflow-hidden rounded-xl bg-white shadow-sm">
      <div className="flex items-center justify-between px-4 pt-4 pb-1">
        <div className="flex items-center gap-2">
          <Icon size={16} className="text-primary" />
          <div>
            <h2 className="text-[15px] font-bold leading-tight">{title}</h2>
            <p className="text-[11px] text-gray-400">{desc}</p>
          </div>
        </div>
        <Link
          href={moreHref}
          className="flex items-center gap-0.5 text-xs font-medium text-gray-400 transition-colors hover:text-primary"
        >
          더보기
          <ChevronRight size={14} />
        </Link>
      </div>
      {children}
    </section>
  );
}

/** 홈용 간결 오디션 행 — 인셋 디바이더 리스트 (AuditionCard 축약판) */
function HomeAuditionRow({
  audition,
  showOneClick = false,
}: {
  audition: Audition;
  showOneClick?: boolean;
}) {
  const dday = getDday(audition.deadline);
  const ddayColor =
    dday !== null && dday <= 3
      ? "text-red-500"
      : dday !== null && dday <= 7
        ? "text-amber-500"
        : "text-gray-400";

  return (
    <li>
      <Link
        href={`/audition/${audition.id}`}
        className="block px-4 py-3 transition-colors active:bg-gray-50"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold leading-snug line-clamp-1">
              {audition.title}
            </h3>
            <div className="mt-1 flex items-center gap-1.5">
              {audition.company && (
                <span className="max-w-[140px] truncate text-xs text-gray-400">
                  {audition.company}
                </span>
              )}
              <Badge className="bg-gray-100 text-gray-500">
                {audition.genre}
              </Badge>
              {showOneClick && <Badge variant="success">원클릭 지원</Badge>}
            </div>
          </div>
          <span
            className={cn(
              "shrink-0 text-xs font-semibold tabular-nums",
              ddayColor
            )}
          >
            {formatDday(audition.deadline)}
          </span>
        </div>
      </Link>
    </li>
  );
}

function SectionEmpty({ text }: { text: string }) {
  return <p className="px-4 py-6 text-center text-xs text-gray-400">{text}</p>;
}
