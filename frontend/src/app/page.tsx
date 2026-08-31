import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { Reveal } from "@/components/landing/Reveal";
import { getDday } from "@/lib/utils";

/**
 * 랜딩 — A안 「동틀 녘」 (2026-08-31 확정).
 *
 * 디자인 캔버스 design/FullA.dc.html 을 정본으로 이식했다.
 *
 * 시스템:
 *   여명 #F7F4EF / 잉크 #141110 / 불꽃 #F0330F / 노을 #FF8A1E
 *   액센트가 붙는 곳: 상단 띠, 눈썹, 「관리」, 오늘 신규 숫자, CTA, 원클릭 상태.
 *
 * 카피 규칙 (제원 확정):
 *   - 눈썹 = "당신의 매니저가 되어 드립니다"
 *   - "대신 지원"이라는 말은 쓰지 않는다 → 언제나 "원클릭 지원"
 *   - 비교군 = 소속사 있는 연예인 vs 혼자 준비하는 연습생 및 지원자
 *   - 랜딩·마케팅 문구에 수집처(타 플랫폼) 이름을 쓰지 않는다.
 *     원문 링크는 공고 상세 페이지 안에서만 산다.
 *
 * 데이터 규칙: 화면의 숫자는 전부 DB 실측. 실측이 없는 것(지역 분포 등)은
 * 만들어 넣지 않고 뺀다. 3컷 일러스트만 예시 데이터임이 자명한 제품 그림.
 *
 * 서버 컴포넌트 + ISR — 크롤러가 실공고와 내부 링크를 그대로 받아간다.
 */
export const revalidate = 900;

interface Card {
  id: string;
  title: string;
  company: string | null;
  category: string | null;
  genre: string;
  deadline: string | null;
  apply_type: string | null;
}

interface Stats {
  active: number;
  today: number;
  oneclick: number;
}

interface Cat {
  name: string;
  count: number;
}

async function getData(): Promise<{ cards: Card[]; stats: Stats; cats: Cat[] }> {
  const sb = createServiceRoleClient();
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

  // 첫 화면 공고: 마감이 남아 있고 원클릭 되는 것 우선, 최신순.
  const { data: rows } = await sb
    .from("auditions")
    .select("id,title,company,category,genre,deadline,apply_type")
    .eq("is_active", true)
    .or(`deadline.gte.${today},deadline.is.null`)
    .order("apply_type", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(12);

  const head = () => sb.from("auditions").select("id", { count: "exact", head: true });
  const dayAgo = new Date(Date.now() - 86400000).toISOString();

  const [activeR, todayR, oneclickR, catR] = await Promise.all([
    head().eq("is_active", true),
    head().eq("is_active", true).gte("created_at", dayAgo),
    head().eq("is_active", true).eq("apply_type", "email"),
    sb
      .from("auditions")
      .select("category")
      .eq("is_active", true)
      .not("category", "is", null)
      .limit(5000),
  ]);

  // 분야 칩은 이름만이 아니라 건수까지 실측으로 단다.
  const counts = new Map<string, number>();
  for (const r of catR.data ?? []) {
    const c = (r.category as string)?.trim();
    if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  const cats = [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return {
    cards: (rows ?? []) as Card[],
    stats: {
      active: activeR.count ?? 0,
      today: todayR.count ?? 0,
      oneclick: oneclickR.count ?? 0,
    },
    cats,
  };
}

function dday(deadline: string | null): { label: string; urgent: boolean } {
  const d = getDday(deadline);
  if (d === null) return { label: "상시", urgent: false };
  if (d < 0) return { label: "마감", urgent: false };
  if (d === 0) return { label: "오늘 마감", urgent: true };
  return { label: `D-${d}`, urgent: d <= 3 };
}

/* ── 원자 컴포넌트 ────────────────────────────────────────────── */

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-bold tracking-[0.2em] text-[#F0330F]">
      {children}
    </span>
  );
}

function FlameCta({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-3 rounded-full bg-[#F0330F] px-7 py-3.5 text-[15px] font-bold text-white shadow-[0_14px_30px_-14px_rgba(240,51,15,0.62)] transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]"
    >
      {children}
      <svg
        viewBox="0 0 16 16"
        className="size-3.5 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0.5"
        fill="none"
        aria-hidden
      >
        <path d="M2.5 8h11M9 3.5L13.5 8 9 12.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}

/** 공고 카드 — 목록·그리드 공용. 원클릭 여부와 마감이 한눈에. */
function AuditionCard({ a }: { a: Card }) {
  const d = dday(a.deadline);
  const oneclick = a.apply_type === "email";
  return (
    <Link
      href={`/audition/${a.id}`}
      className="group flex h-full flex-col rounded-[18px] border border-[#CFC3AF] bg-white px-5 py-4.5 transition-[transform,border-color] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5 hover:border-[#C9BFAF]"
    >
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold tracking-[0.1em] text-[#736C5F]">
          {a.category || a.genre}
        </span>
        <span
          className={`ml-auto text-[12px] font-bold tabular-nums ${
            d.urgent ? "text-[#F0330F]" : "text-[#57524A]"
          }`}
        >
          {d.label}
        </span>
      </div>
      <p className="mt-2.5 line-clamp-2 text-[15.5px] leading-snug font-bold tracking-[-0.02em] text-[#141110]">
        {a.title}
      </p>
      {a.company && (
        <p className="mt-2 truncate text-[12.5px] text-[#645E53]">{a.company}</p>
      )}
      <div className="mt-auto border-t border-[#E3D9C9] pt-3.5" style={{ marginTop: "auto" }}>
        <span
          className={`inline-block rounded-full px-4 py-1.5 text-[12.5px] font-bold transition-colors duration-500 ${
            oneclick
              ? "border-2 border-[#141110] text-[#141110] group-hover:bg-[#141110] group-hover:text-[#F7F4EF]"
              : "text-[#736C5F]"
          }`}
        >
          {oneclick ? "원클릭 지원" : "공고 보기"}
        </span>
      </div>
    </Link>
  );
}

/* ── 페이지 ───────────────────────────────────────────────────── */

export default async function LandingPage() {
  // 로그인 상태면 개인화 피드로. 랜딩은 처음 온 사람의 화면이다.
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/home");

  const { cards, stats, cats } = await getData();
  const stack = cards.slice(0, 3); // 히어로 카드 스택
  const grid = cards.slice(3, 12); // 오늘의 공고 그리드
  const nf = new Intl.NumberFormat("ko-KR");

  return (
    <main className="relative min-h-[100dvh] bg-[#F7F4EF] text-[#141110]">
      {/* 동틀 녘 모션 — 전부 CSS, prefers-reduced-motion 이면 정지 */}
      <style>{`
        @keyframes ap-dawn {
          0%, 100% { transform: translate3d(0,0,0) scale(1); opacity: .5; }
          50% { transform: translate3d(-2%,1.5%,0) scale(1.07); opacity: .82; }
        }
        @keyframes ap-lift-a { 0%,100% { transform: rotate(-3.2deg) translateY(0); } 50% { transform: rotate(-3.2deg) translateY(-7px); } }
        @keyframes ap-lift-b { 0%,100% { transform: rotate(1.8deg) translateY(0); } 50% { transform: rotate(1.8deg) translateY(-5px); } }
        @keyframes ap-lift-c { 0%,100% { transform: rotate(-0.5deg) translateY(0); } 50% { transform: rotate(-0.5deg) translateY(-9px); } }
        .ap-dawn { animation: ap-dawn 22s ease-in-out infinite; }
        .ap-lift-a { animation: ap-lift-a 11s ease-in-out infinite; }
        .ap-lift-b { animation: ap-lift-b 9s ease-in-out infinite .6s; }
        .ap-lift-c { animation: ap-lift-c 7.5s ease-in-out infinite .2s; }
        @media (prefers-reduced-motion: reduce) {
          .ap-dawn, .ap-lift-a, .ap-lift-b, .ap-lift-c { animation: none; }
        }
      `}</style>

      {/* 상단 불꽃 띠 — 페이지를 열자마자 온도가 먼저 보인다 */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 z-20 h-[5px]"
        style={{ background: "linear-gradient(to right, #F0330F, #FF8A1E 46%, rgba(255,138,30,0) 82%)" }}
      />

      {/* ── 히어로 ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* 동틀 녘 — 지평선 너머에서 올라오는 열 */}
        <div
          aria-hidden
          className="ap-dawn pointer-events-none absolute -top-[260px] -right-[180px] h-[880px] w-[1060px]"
          style={{
            background:
              "radial-gradient(ellipse at 58% 38%, rgba(255,138,30,0.34), rgba(255,92,32,0.17) 38%, rgba(255,190,120,0.07) 60%, rgba(247,244,239,0) 76%)",
          }}
        />
        {/* 종이 결 */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.018] mix-blend-multiply"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E\")",
          }}
        />

        {/* 내비 — 로고와 입장 동선만 남긴다 */}
        <header className="relative z-10 mx-auto flex max-w-6xl items-center px-5 pt-8">
          <Link href="/" className="text-[17px] font-black tracking-[-0.045em]">
            오디션패스
          </Link>
          <div className="ml-auto flex items-center gap-5">
            <Link href="/login" className="text-[14px] font-medium text-[#454138] transition-colors hover:text-[#141110]">
              로그인
            </Link>
            <Link
              href="/signup"
              className="rounded-full bg-[#141110] px-5 py-2.5 text-[13.5px] font-bold text-[#F7F4EF] transition-opacity duration-300 hover:opacity-85"
            >
              무료로 시작
            </Link>
          </div>
        </header>

        <div className="relative z-10 mx-auto grid max-w-6xl gap-12 px-5 pt-14 pb-20 md:grid-cols-[1.1fr_1fr] md:items-center md:gap-14 md:pt-24 md:pb-28">
          {/* 왼쪽: 약속 */}
          <Reveal>
            <Eyebrow>당신의 매니저가 되어 드립니다</Eyebrow>
            <h1 className="mt-5 text-[38px] leading-[1.12] font-black tracking-[-0.05em] sm:text-[52px] md:text-[60px]">
              당신의 꿈은, 우리가
              <br />
              <span className="text-[#F0330F]">관리</span>하겠습니다
            </h1>
            <p className="mt-6 max-w-[40ch] text-[16.5px] leading-[1.72] text-[#3A362E]">
              소속사 있는 연예인은 매니저가 공고를 찾아주고, 프로필을 대신 써서 보내줍니다.
              그 일을 오디션패스가 합니다. 새 공고를 매일 모아 오고, 프로필은 AI가 다듬고,
              지원은 버튼 하나로 끝납니다.
            </p>

            {/* 근거는 숫자로. 형용사는 쓰지 않는다. */}
            <div className="mt-9 flex gap-10 border-t border-[#D9CEBE] pt-7 sm:gap-12">
              <div>
                <p className="text-[30px] font-black tracking-[-0.03em] tabular-nums sm:text-[32px]">
                  {nf.format(stats.active)}
                </p>
                <p className="mt-1 text-[12.5px] font-medium text-[#57524A]">진행 중인 공고</p>
              </div>
              <div>
                <p className="text-[30px] font-black tracking-[-0.03em] text-[#F0330F] tabular-nums sm:text-[32px]">
                  {nf.format(stats.today)}
                </p>
                <p className="mt-1 text-[12.5px] font-medium text-[#57524A]">오늘 새로 올라온 공고</p>
              </div>
              <div>
                <p className="text-[30px] font-black tracking-[-0.03em] tabular-nums sm:text-[32px]">0원</p>
                <p className="mt-1 text-[12.5px] font-medium text-[#57524A]">지금은 전부 무료</p>
              </div>
            </div>

            <div className="mt-9 flex flex-wrap items-center gap-5">
              <FlameCta href="/auditions">오늘의 공고 보기</FlameCta>
              <span className="text-[14px] font-medium text-[#57524A]">
                가입은 원클릭 지원할 때만 필요합니다
              </span>
            </div>
          </Reveal>

          {/* 오른쪽: 실제 공고가 쌓인 카드 스택 (모바일에서는 감춘다 — 그리드가 바로 아래 있다) */}
          <Reveal delay={120} className="hidden md:block">
            <div className="relative h-[420px]">
              {stack.map((a, i) => {
                const d = dday(a.deadline);
                const pos = [
                  "ap-lift-a top-0 left-1 w-[86%]",
                  "ap-lift-b top-[88px] left-9 w-[86%]",
                  "ap-lift-c top-[186px] left-0 w-[94%]",
                ][i];
                const front = i === 2;
                return (
                  <Link
                    key={a.id}
                    href={`/audition/${a.id}`}
                    className={`absolute block rounded-[20px] border px-6 py-5 ${pos} ${
                      front
                        ? "border-[#CFC3AF] bg-white shadow-[0_26px_54px_-30px_rgba(72,32,16,0.4),0_6px_16px_-10px_rgba(72,32,16,0.2)]"
                        : "border-[#D5C9B8] bg-[#FDFCF8]"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-[10.5px] font-bold tracking-[0.12em] text-[#736C5F]">
                        {a.category || a.genre}
                      </span>
                      {front && a.apply_type === "email" && (
                        <span className="rounded-full bg-[#FFE7E0] px-2.5 py-0.5 text-[10.5px] font-bold text-[#F0330F]">
                          원클릭 지원
                        </span>
                      )}
                      <span
                        className={`ml-auto text-[11.5px] font-bold tabular-nums ${
                          d.urgent ? "text-[#F0330F]" : "text-[#736C5F]"
                        }`}
                      >
                        {d.label}
                      </span>
                    </div>
                    <p
                      className={`mt-2.5 line-clamp-2 leading-snug font-bold tracking-[-0.02em] ${
                        front ? "text-[18px] font-black text-[#141110]" : "text-[15px] text-[#3F3B34]"
                      }`}
                    >
                      {a.title}
                    </p>
                    {front && a.company && (
                      <p className="mt-2 truncate text-[13px] text-[#645E53]">{a.company}</p>
                    )}
                  </Link>
                );
              })}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── 오늘의 공고: 설명 대신 재고 ─────────────────────────── */}
      <section className="border-t border-[#DCD2C1] bg-white">
        <div className="mx-auto max-w-6xl px-5 pt-14 pb-20 md:pt-16 md:pb-24">
          {/* 검색 — 랜딩에서는 목록으로 보내는 문이다 */}
          <Reveal>
            <Link
              href="/auditions"
              className="flex items-center gap-3 rounded-full border-2 border-[#141110] py-2 pr-2 pl-5 transition-colors duration-500 hover:bg-[#FBF8F3]"
            >
              <svg viewBox="0 0 20 20" className="size-[18px] flex-none" fill="none" aria-hidden>
                <circle cx="9" cy="9" r="6.2" stroke="#736C5F" strokeWidth="1.8" />
                <path d="M13.6 13.6L17.5 17.5" stroke="#736C5F" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              <span className="flex-1 truncate text-[15px] text-[#847C6F] sm:text-[16px]">
                배역, 분야, 지역으로 찾아보세요
              </span>
              <span className="rounded-full bg-[#F0330F] px-6 py-2.5 text-[14px] font-black text-white">
                검색
              </span>
            </Link>

            {/* 분야 칩 — 이름도 건수도 전부 실측 */}
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/auditions"
                className="rounded-full bg-[#141110] px-4 py-2 text-[13px] font-bold text-[#F7F4EF]"
              >
                전체 {nf.format(stats.active)}
              </Link>
              {cats.map((c) => (
                <Link
                  key={c.name}
                  href={`/auditions?filter=${encodeURIComponent(c.name)}`}
                  className="rounded-full border border-[#CFC3AF] px-4 py-2 text-[13px] font-medium text-[#37342E] transition-colors duration-500 hover:border-[#141110]"
                >
                  {c.name} <span className="text-[#736C5F]">{nf.format(c.count)}</span>
                </Link>
              ))}
            </div>
          </Reveal>

          <Reveal>
            <div className="mt-11 flex items-baseline border-b-2 border-[#141110] pb-4">
              <h2 className="text-[24px] font-black tracking-[-0.04em] sm:text-[30px]">
                오늘 올라온 공고
              </h2>
              <span className="ml-3.5 text-[15px] font-black text-[#F0330F] tabular-nums">
                {nf.format(stats.today)}건
              </span>
              <span className="ml-auto hidden text-[13.5px] font-medium text-[#57524A] sm:block">
                마감 임박순
              </span>
            </div>
          </Reveal>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {grid.map((a, i) => (
              <Reveal key={a.id} delay={(i % 3) * 70}>
                <AuditionCard a={a} />
              </Reveal>
            ))}
          </div>

          <Reveal>
            <div className="mt-8 flex flex-wrap items-center gap-5">
              <Link
                href="/auditions"
                className="group inline-flex items-center gap-3 rounded-full bg-[#141110] px-7 py-3.5 text-[15px] font-bold text-[#F7F4EF] transition-transform duration-500 active:scale-[0.98]"
              >
                공고 {nf.format(stats.active)}건 전체 보기
                <svg viewBox="0 0 16 16" className="size-3.5" fill="none" aria-hidden>
                  <path d="M2.5 8h11M9 3.5L13.5 8 9 12.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
              <span className="text-[14px] font-medium text-[#57524A]">
                가입 없이 전부 열람할 수 있습니다
              </span>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── 원클릭 지원: 글 대신 화면 ───────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-20 md:py-24">
        <Reveal>
          <h2 className="text-[30px] leading-[1.16] font-black tracking-[-0.05em] sm:text-[40px]">
            원클릭 지원은 이렇게 갑니다
          </h2>
        </Reveal>

        <div className="mt-9 grid gap-6 md:grid-cols-3 md:gap-5">
          {/* 1컷 — 공고 상세. 원문 링크는 여기 안에서만 산다. */}
          <Reveal delay={0}>
            <div className="overflow-hidden rounded-2xl border border-[#CFC3AF] bg-[#FBF8F3]">
              <div className="flex items-center gap-1.5 border-b border-[#CFC3AF] px-4 py-2.5">
                {[0, 1, 2].map((k) => (
                  <span key={k} className="size-2 rounded-full bg-[#C8BCA9]" />
                ))}
              </div>
              <div className="min-h-[236px] bg-white p-5">
                <p className="text-[10.5px] font-bold tracking-[0.12em] text-[#736C5F]">
                  뮤지컬 &nbsp; 오늘 마감
                </p>
                <p className="mt-2.5 text-[15.5px] leading-snug font-black">
                  어린이 뮤지컬 배우 모집
                </p>
                <div className="mt-3.5 space-y-1.5 border-y border-[#E3D9C9] py-3 text-[12px] text-[#57524A]">
                  <p>모집 배역 &nbsp; 여자 주연 1명, 앙상블 4명</p>
                  <p>연령 &nbsp; 18세 이상 28세 이하</p>
                  <p>보수 &nbsp; 회차당 협의</p>
                </div>
                <p className="mt-3 text-[11.5px] font-bold text-[#847C6F]">원문 공고 보기 →</p>
                <div className="mt-3 rounded-full bg-[#F0330F] py-3 text-center text-[13.5px] font-black text-white">
                  원클릭 지원
                </div>
              </div>
            </div>
            <p className="mt-4 text-[15px] font-bold">버튼 하나 누르면</p>
          </Reveal>

          {/* 2컷 — AI 프로필 */}
          <Reveal delay={90}>
            <div className="overflow-hidden rounded-2xl border border-[#CFC3AF] bg-[#FBF8F3]">
              <div className="flex items-center gap-1.5 border-b border-[#CFC3AF] px-4 py-2.5">
                {[0, 1, 2].map((k) => (
                  <span key={k} className="size-2 rounded-full bg-[#C8BCA9]" />
                ))}
              </div>
              <div className="min-h-[236px] bg-white p-5">
                <p className="text-[15.5px] font-black">프로필은 AI가 씁니다</p>
                <p className="mt-1.5 text-[12px] text-[#645E53]">넣으시는 건 이 정도가 전부입니다</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {["24세", "168cm", "뮤지컬 앙상블 2회", "보컬 가능"].map((chip) => (
                    <span
                      key={chip}
                      className="rounded-lg border border-[#DFD3C0] bg-[#FBF8F3] px-2.5 py-1.5 text-[11.5px] font-bold"
                    >
                      {chip}
                    </span>
                  ))}
                </div>
                <p className="mt-3.5 mb-1.5 text-[10.5px] font-bold tracking-[0.14em] text-[#F0330F]">
                  AI가 다듬은 소개
                </p>
                <div className="rounded-xl border border-[#F5DDD5] bg-[#FFF8F5] px-3.5 py-3">
                  <p className="text-[12px] leading-[1.72] text-[#37342E]">
                    앙상블로 두 시즌을 보내며 군무와 화음을 몸으로 익혔습니다. 노래와 안무를 함께
                    소화합니다.
                  </p>
                </div>
                <div className="mt-3.5 rounded-full bg-[#141110] py-3 text-center text-[13.5px] font-black text-[#F7F4EF]">
                  이대로 보내기
                </div>
              </div>
            </div>
            <p className="mt-4 text-[15px] font-bold">정보만 넣으면 AI가 씁니다</p>
          </Reveal>

          {/* 3컷 — 지원 내역 */}
          <Reveal delay={180}>
            <div className="overflow-hidden rounded-2xl border border-[#CFC3AF] bg-[#FBF8F3]">
              <div className="flex items-center gap-1.5 border-b border-[#CFC3AF] px-4 py-2.5">
                {[0, 1, 2].map((k) => (
                  <span key={k} className="size-2 rounded-full bg-[#C8BCA9]" />
                ))}
              </div>
              <div className="min-h-[236px] bg-white p-5">
                <p className="text-[15.5px] font-black">내 지원 내역</p>
                <div className="mt-3.5">
                  {[
                    { t: "뮤지컬 배우 모집", s: "보냄 09:12 · 회신 도착 14:05", hot: true },
                    { t: "연극 배역 오디션", s: "보냄 10:04 · 접수됨", hot: false },
                    { t: "광고 촬영 모델", s: "보냄 11:37 · 회신 도착 11:02", hot: true },
                    { t: "독립영화 주연", s: "보냄 14:50 · 접수됨", hot: false },
                  ].map((r, i, arr) => (
                    <div
                      key={r.t}
                      className={`py-2.5 ${i < arr.length - 1 ? "border-b border-[#E3D9C9]" : ""}`}
                    >
                      <p className="text-[12.5px] font-bold">{r.t}</p>
                      <p
                        className={`mt-1 text-[11.5px] tabular-nums ${
                          r.hot ? "font-bold text-[#F0330F]" : "text-[#645E53]"
                        }`}
                      >
                        {r.s}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <p className="mt-4 text-[15px] font-bold">보낸 시각까지 남습니다</p>
          </Reveal>
        </div>

        <Reveal>
          <p className="mt-7 text-[14.5px] font-medium text-[#57524A]">
            지원자는 언제나 회원님 본인입니다. 회신도 오디션패스를 거치지 않고 회원님 메일로 바로
            옵니다.
          </p>
        </Reveal>
      </section>

      {/* ── 격차 — 띠 하나로 ────────────────────────────────────── */}
      <section className="bg-[#141110] text-[#F7F4EF]">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-16 md:flex-row md:items-center md:gap-14 md:py-[70px]">
          <div className="flex flex-none items-baseline gap-10 sm:gap-11">
            <div>
              <p>
                <span className="text-[46px] font-black tracking-[-0.045em] text-[#6E675E] tabular-nums sm:text-[54px]">
                  15
                </span>
                <span className="ml-1.5 text-[16px] font-bold text-[#6E675E]">건</span>
              </p>
              <p className="mt-1.5 text-[12.5px] font-bold text-[#6E675E]">
                소속사 있는 연예인의 주당 지원
              </p>
            </div>
            <div>
              <p>
                <span className="text-[46px] font-black tracking-[-0.045em] text-[#F0330F] tabular-nums sm:text-[54px]">
                  1
                </span>
                <span className="ml-1.5 text-[16px] font-bold text-[#B8B1A8]">건</span>
              </p>
              <p className="mt-1.5 text-[12.5px] font-bold text-[#B8B1A8]">
                혼자 준비하는 연습생 및 지원자
              </p>
            </div>
          </div>
          <p className="text-[21px] leading-[1.56] font-black tracking-[-0.035em] sm:text-[24px]">
            차이는 재능이 아니라 시간입니다.
            <br />
            <span className="text-[#FF8A1E]">그 시간을 우리가 씁니다.</span>
          </p>
        </div>
      </section>

      {/* ── 요금 ────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-20 md:py-24">
        <Reveal>
          <h2 className="text-[30px] leading-[1.16] font-black tracking-[-0.05em] sm:text-[40px]">
            무료로 시작합니다
          </h2>
        </Reveal>

        <div className="mt-8 grid gap-5 md:grid-cols-2">
          <Reveal delay={0}>
            <div className="h-full rounded-[22px] border border-[#CFC3AF] bg-white px-8 py-8">
              <p className="text-[12.5px] font-black tracking-[0.16em] text-[#736C5F]">무료</p>
              <p className="mt-3.5 text-[42px] font-black tracking-[-0.045em]">0원</p>
              <div className="mt-6 space-y-3 border-t border-[#E3D9C9] pt-5 text-[15.5px] font-medium text-[#37342E]">
                <p>전체 공고 열람 — 가입 없이</p>
                <p>
                  원클릭 지원 하루 <b className="font-black text-[#141110]">5건</b>
                </p>
                <p>
                  광고를 한 번 보면 <b className="font-black text-[#141110]">3건</b> 추가
                </p>
                <p>지원 기록 열람</p>
              </div>
              <Link
                href="/signup"
                className="mt-7 block rounded-full border-2 border-[#141110] py-3.5 text-center text-[15px] font-bold transition-colors duration-500 hover:bg-[#141110] hover:text-[#F7F4EF]"
              >
                무료로 시작하기
              </Link>
            </div>
          </Reveal>

          <Reveal delay={100}>
            <div className="relative h-full overflow-hidden rounded-[22px] bg-[#141110] px-8 py-8 text-[#F7F4EF]">
              <div
                aria-hidden
                className="absolute inset-x-0 top-0 h-1"
                style={{ background: "linear-gradient(to right, #F0330F, #FF8A1E 60%, rgba(255,138,30,0))" }}
              />
              <div className="flex items-baseline">
                <p className="text-[12.5px] font-black tracking-[0.16em] text-[#FF8A1E]">프로</p>
                <span className="ml-auto rounded-full bg-[#F0330F]/[0.18] px-2.5 py-1 text-[11px] font-bold text-[#FF8A1E]">
                  현재 무료
                </span>
              </div>
              <p className="mt-3.5 flex items-baseline gap-3">
                <span className="text-[22px] font-bold text-[#7E786F] line-through decoration-2">
                  월 9,900원
                </span>
                <span className="text-[42px] font-black tracking-[-0.045em]">0원</span>
              </p>
              <p className="mt-1.5 text-[14px] text-[#847C6F]">지금은 전부 열어두고 있습니다</p>
              <div className="mt-6 space-y-3 border-t border-[#33302B] pt-5 text-[15.5px] font-medium text-[#DCD6CE]">
                <p>
                  원클릭 지원 <b className="font-black text-[#F7F4EF]">무제한</b>, 광고 없이
                </p>
                <p>마감 하루 전 알림</p>
                <p>새 공고가 올라오면 즉시 알림</p>
                <p>지원 우선 처리</p>
              </div>
              <Link
                href="/signup"
                className="mt-7 block rounded-full bg-[#F0330F] py-3.5 text-center text-[15px] font-black text-white transition-transform duration-500 active:scale-[0.98]"
              >
                지금 무료로 쓰기
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── 자주 묻는 질문 ──────────────────────────────────────── */}
      <section className="border-t border-[#DCD2C1] bg-white">
        <div className="mx-auto max-w-6xl px-5 py-20 md:py-24">
          <Reveal>
            <h2 className="text-[30px] leading-[1.16] font-black tracking-[-0.05em] sm:text-[40px]">
              먼저 궁금해하시는 것들
            </h2>
          </Reveal>
          <dl className="mt-9 grid gap-x-16 md:grid-cols-2">
            {[
              {
                q: "제 이름으로 지원되나요?",
                a: "네. 지원자는 회원님 본인입니다. 오디션패스는 프로필을 대신 쓰고 대신 보낼 뿐이고, 회신도 회원님 메일로 직접 옵니다.",
              },
              {
                q: "프로필은 어떻게 만드나요?",
                a: "나이, 키, 해본 것 정도만 넣으시면 AI가 매력적인 소개로 다듬어 줍니다. 한 번 만들어 두면 이후 지원은 그대로 나갑니다.",
              },
              {
                q: "지원했는데 연락이 없으면요?",
                a: "보낸 시각과 접수 여부는 지원 내역에 그대로 남습니다. 다만 회신 여부는 공고를 낸 쪽의 몫이라 오디션패스가 약속드릴 수 없습니다.",
              },
              {
                q: "참가비를 요구하는 공고는요?",
                a: "참가비, 교육비, 프로필 촬영비를 요구하는 공고는 걸러냅니다. 걸러내지 못한 것이 보이면 신고해주세요.",
              },
            ].map((f, i) => (
              <Reveal key={f.q} delay={(i % 2) * 60}>
                <div
                  className={`border-t py-6 ${i < 2 ? "border-[#141110]" : "border-[#D9CEBE]"}`}
                >
                  <dt className="text-[17px] font-black tracking-[-0.03em] sm:text-[18px]">
                    {f.q}
                  </dt>
                  <dd className="mt-2.5 text-[15px] leading-[1.78] text-[#3A362E]">{f.a}</dd>
                </div>
              </Reveal>
            ))}
          </dl>
        </div>
      </section>

      {/* ── 마무리 + 푸터 ───────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-[#141110] text-[#F7F4EF]">
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-1"
          style={{ background: "linear-gradient(to right, #F0330F, #FF8A1E 46%, rgba(255,138,30,0) 82%)" }}
        />
        <div
          aria-hidden
          className="ap-dawn pointer-events-none absolute -top-[300px] -right-[160px] h-[720px] w-[900px]"
          style={{
            background:
              "radial-gradient(ellipse at 58% 40%, rgba(255,138,30,0.26), rgba(255,92,32,0.11) 40%, rgba(20,17,16,0) 74%)",
          }}
        />

        <div className="relative mx-auto max-w-6xl px-5 pt-20 md:pt-24">
          <Reveal>
            <h2 className="text-[34px] leading-[1.14] font-black tracking-[-0.05em] sm:text-[48px]">
              지금도 <span className="text-[#F0330F]">{nf.format(stats.active)}건</span>이
              <br />
              열려 있습니다
            </h2>
            <div className="mt-8 flex flex-wrap items-center gap-5">
              <FlameCta href="/auditions">오늘의 공고 보기</FlameCta>
              <span className="text-[14.5px] font-medium text-[#918A82]">
                가입은 원클릭 지원할 때만 필요합니다
              </span>
            </div>
          </Reveal>
        </div>

        <footer className="relative mx-auto mt-16 max-w-6xl border-t border-[#33302B] px-5 pt-7 pb-10 md:mt-20">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            <div>
              <p className="text-[15px] font-black tracking-[-0.03em]">오디션패스</p>
              <p className="mt-2.5 text-[12.5px] leading-[1.8] text-[#7E786F]">
                당신의 매니저가 되어 드립니다
              </p>
              {/* 전자상거래법 표시사항 — 상호는 운영사(턴오버), 서비스명과 다르다 */}
              <p className="mt-4 text-[11.5px] leading-[1.9] text-[#6E675E]">
                상호 턴오버 &nbsp; 대표 나현석
                <br />
                사업자등록번호 608-30-93687
                <br />
                업태 정보통신업 &nbsp; 종목 전자상거래 중개업, 포털 및 기타 인터넷 정보 매개
                서비스업
              </p>
            </div>
            <nav className="flex flex-wrap gap-x-7 gap-y-2 text-[13px] font-medium text-[#918A82] sm:ml-auto">
              <Link href="/auditions" className="transition-colors hover:text-[#F7F4EF]">
                공고
              </Link>
              <Link href="/community" className="transition-colors hover:text-[#F7F4EF]">
                커뮤니티
              </Link>
              <Link href="/terms" className="transition-colors hover:text-[#F7F4EF]">
                이용약관
              </Link>
              <Link href="/privacy" className="transition-colors hover:text-[#F7F4EF]">
                개인정보처리방침
              </Link>
            </nav>
          </div>
          <p className="mt-8 text-[11px] text-[#6E675E] tabular-nums">
            © {new Date().getFullYear()} 오디션패스
          </p>
        </footer>
      </section>
    </main>
  );
}
