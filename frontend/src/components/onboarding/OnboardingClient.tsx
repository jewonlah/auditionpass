"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { cn, formatDday, getDday, unwrapOnboardingReturnTo } from "@/lib/utils";
import { PROFILE_GENRES } from "@/lib/profile";
import { track } from "@/lib/analytics";

type Step = 1 | 2 | 3;

interface RecommendedAudition {
  id: string;
  title: string;
  company: string | null;
  genre: string;
  deadline: string | null;
  apply_type: "email" | "external";
}

const GENDERS = ["남성", "여성", "기타"] as const;
const THIS_YEAR = new Date().getFullYear();

/**
 * 온보딩 3스텝 (11_prd F4 · 12_ia-userflows §1.1·§4 F1).
 *
 * 스킵 규칙: Step1·Step3는 "건너뛰기"로 온보딩 전체를 종료할 수 있다(완성도 카드가
 * 잔여 스텝을 회수). Step2(미니 프로필)만은 스킵을 제공하지 않는다 — 프로필이 없으면
 * 원클릭 지원 자체가 열리지 않기 때문이다.
 */
export function OnboardingClient({ returnTo }: { returnTo: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [genres, setGenres] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [gender, setGender] = useState("");
  const [profileCreated, setProfileCreated] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [recommended, setRecommended] = useState<RecommendedAudition[] | null>(null);

  useEffect(() => {
    track("onboarding_step_view", { step });
  }, [step]);

  useEffect(() => {
    if (step !== 3) return;
    let cancelled = false;
    (async () => {
      try {
        const qs = genres.length > 0 ? `?genres=${encodeURIComponent(genres.join(","))}` : "";
        const res = await fetch(`/api/onboarding/recommended${qs}`);
        const data = await res.json();
        if (!cancelled) setRecommended(res.ok ? (data.auditions ?? []) : []);
      } catch {
        if (!cancelled) setRecommended([]);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  function toggleGenre(g: string) {
    setGenres((prev) => (prev.includes(g) ? prev.filter((v) => v !== g) : [...prev, g]));
  }

  function finish(reason: "skip" | "complete") {
    track(reason === "skip" ? "onboarding_skip" : "onboarding_complete", { step });
    // 방어적 재검증 — 이 컴포넌트에 전달되는 returnTo는 서버(onboarding/page.tsx)에서
    // 이미 벗겨낸 값이어야 하지만, 혹시라도 `/onboarding?returnTo=...`가 흘러들면
    // 여기서도 한 번 더 풀어 온보딩으로 되돌아가는 루프를 만들지 않는다.
    router.replace(unwrapOnboardingReturnTo(returnTo));
  }

  function goToAudition(id: string) {
    track("onboarding_complete", { step, via: "card" });
    router.replace(`/audition/${id}`);
  }

  async function handleSaveProfile() {
    setError("");
    const y = Number(birthYear);
    if (!name.trim()) {
      setError("이름을 입력해주세요.");
      return;
    }
    if (!y || y < 1940 || y > THIS_YEAR - 14) {
      setError("올바른 출생연도를 입력해주세요. (14세 이상)");
      return;
    }
    if (!gender) {
      setError("성별을 선택해주세요.");
      return;
    }

    setSubmitting(true);
    const payload = { name: name.trim(), birth_year: y, gender, genre: genres };

    try {
      let res = await fetch("/api/profile", {
        method: profileCreated ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      // 이미 생성된 프로필에 POST가 갔다면(중복 탭 등) PUT으로 재시도
      if (res.status === 409) {
        res = await fetch("/api/profile", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "저장에 실패했습니다. 다시 시도해주세요.");
        setSubmitting(false);
        return;
      }
      setProfileCreated(true);
      setStep(3);
    } catch {
      setError("네트워크 오류가 발생했습니다. 다시 시도해주세요.");
    }
    setSubmitting(false);
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-white">
    <div className="mx-auto flex h-full w-full max-w-md flex-col">
      <OnboardingHeader
        step={step}
        onBack={() => setStep((s) => (s === 3 ? 2 : 1))}
        onSkip={() => finish("skip")}
      />

      <div className="flex-1 overflow-y-auto px-5 pb-8 pt-5">
        {step === 1 && <StepGenre genres={genres} onToggle={toggleGenre} />}
        {step === 2 && (
          <StepProfile
            name={name}
            setName={setName}
            birthYear={birthYear}
            setBirthYear={setBirthYear}
            gender={gender}
            setGender={setGender}
            error={error}
          />
        )}
        {step === 3 && <StepRecommend recommended={recommended} onTapAudition={goToAudition} />}
      </div>

      <footer className="shrink-0 border-t border-gray-100 px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
        {step === 1 && (
          <Button size="lg" className="w-full" onClick={() => setStep(2)} disabled={genres.length === 0}>
            다음
          </Button>
        )}
        {step === 2 && (
          <Button size="lg" className="w-full" onClick={handleSaveProfile} disabled={submitting}>
            {submitting ? "저장 중..." : "다음"}
          </Button>
        )}
        {step === 3 && (
          <Button size="lg" className="w-full" onClick={() => finish("complete")}>
            탐색 계속
          </Button>
        )}
      </footer>
    </div>
    </div>
  );
}

/* ─── 태스크형 헤더 + 스텝퍼 (12 §2.2·23 §2.12) ─── */

function OnboardingHeader({
  step,
  onBack,
  onSkip,
}: {
  step: Step;
  onBack: () => void;
  onSkip: () => void;
}) {
  const titles: Record<Step, string> = {
    1: "분야를 선택해주세요",
    2: "기본 정보를 알려주세요",
    3: "첫 추천 오디션",
  };

  return (
    <header className="shrink-0 border-b border-gray-100 pt-[env(safe-area-inset-top)]">
      <div className="flex h-14 items-center justify-between px-3">
        {step === 1 ? (
          <button
            type="button"
            aria-label="닫기"
            onClick={onSkip}
            className="grid size-11 place-items-center text-gray-400"
          >
            <X size={22} />
          </button>
        ) : (
          <button
            type="button"
            aria-label="이전 단계"
            onClick={onBack}
            className="grid size-11 place-items-center text-gray-400"
          >
            <ChevronLeft size={22} />
          </button>
        )}
        <h1 className="text-[15px] font-semibold text-gray-900">{titles[step]}</h1>
        <span className="size-11" aria-hidden />
      </div>
      <div
        className="flex items-center gap-2 px-5 pb-3"
        aria-live="polite"
        aria-label={`3단계 중 ${step}단계`}
      >
        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-gray-400">
          STEP {step}/3
        </span>
        <div className="flex flex-1 gap-1">
          {([1, 2, 3] as const).map((i) => (
            <div
              key={i}
              className={cn(
                "h-0.5 flex-1 rounded-full transition-colors duration-250",
                i <= step ? "bg-gray-900" : "bg-gray-200"
              )}
            />
          ))}
        </div>
        {step !== 2 && (
          <button type="button" onClick={onSkip} className="min-h-[44px] px-1 text-[13px] text-gray-400">
            건너뛰기
          </button>
        )}
      </div>
    </header>
  );
}

/* ─── Step1: 분야 선택 (단일 질문으로 통합 — A5 해소) ─── */

function StepGenre({ genres, onToggle }: { genres: string[]; onToggle: (g: string) => void }) {
  return (
    <div>
      <p className="text-[22px] font-bold leading-snug text-gray-900">
        관심 있는 분야를
        <br />
        모두 골라주세요
      </p>
      <p className="mt-2 text-[15px] text-gray-500">
        선택한 분야를 기반으로 맞춤 공고를 추천해드려요.
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        {PROFILE_GENRES.map((g) => {
          const active = genres.includes(g);
          return (
            <button
              key={g}
              type="button"
              role="checkbox"
              aria-checked={active}
              onClick={() => onToggle(g)}
              className={cn(
                "min-h-11 rounded-full border px-4 py-2 text-[14px] font-medium transition-colors active:scale-[0.98]",
                active ? "border-primary bg-primary text-white" : "border-gray-300 text-gray-600"
              )}
            >
              {g}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Step2: 미니 프로필 — 이름·출생연도·성별 (스킵 불가) ─── */

function StepProfile({
  name,
  setName,
  birthYear,
  setBirthYear,
  gender,
  setGender,
  error,
}: {
  name: string;
  setName: (v: string) => void;
  birthYear: string;
  setBirthYear: (v: string) => void;
  gender: string;
  setGender: (v: string) => void;
  error: string;
}) {
  return (
    <div>
      <p className="text-[22px] font-bold leading-snug text-gray-900">
        지원에 필요한
        <br />
        최소 정보예요
      </p>
      <p className="mt-2 text-[15px] text-gray-500">
        30초면 충분해요. 나머지는 나중에 채워도 돼요.
      </p>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600" role="alert">
          {error}
        </div>
      )}

      <div className="mt-6 space-y-4">
        <Input
          label="이름"
          placeholder="실명을 입력해주세요"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          label="출생연도"
          type="number"
          inputMode="numeric"
          placeholder="2004"
          value={birthYear}
          onChange={(e) => setBirthYear(e.target.value)}
        />
        <div>
          <p className="mb-1.5 text-sm font-medium text-gray-700">성별</p>
          <div className="grid grid-cols-3 gap-2">
            {GENDERS.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGender(g)}
                className={cn(
                  "min-h-11 rounded-lg border py-2.5 text-sm font-medium transition-colors",
                  gender === g ? "border-primary bg-primary/5 text-primary" : "border-gray-300 text-gray-600"
                )}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Step3: 첫 추천 — 선택 분야 기반 활성 공고 3건 ─── */

function StepRecommend({
  recommended,
  onTapAudition,
}: {
  recommended: RecommendedAudition[] | null;
  onTapAudition: (id: string) => void;
}) {
  return (
    <div>
      <p className="text-[22px] font-bold leading-snug text-gray-900">
        지금 바로 지원할 수 있는
        <br />
        오디션이에요
      </p>
      <p className="mt-2 text-[15px] text-gray-500">
        프로필이 준비됐어요. 마음에 드는 공고를 눌러 바로 지원해보세요.
      </p>

      <div className="mt-6">
        {recommended === null ? (
          <div className="space-y-2" aria-busy="true">
            <span className="sr-only">불러오는 중</span>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[76px] animate-pulse rounded-xl bg-gray-100" aria-hidden />
            ))}
          </div>
        ) : recommended.length === 0 ? (
          <p className="rounded-xl bg-gray-50 px-4 py-8 text-center text-sm text-gray-400">
            지금은 추천할 공고가 없어요. 탐색 탭에서 둘러보세요.
          </p>
        ) : (
          <ul className="space-y-2">
            {recommended.map((a) => {
              const dday = getDday(a.deadline);
              const ddayColor =
                dday !== null && dday <= 3
                  ? "text-red-500"
                  : dday !== null && dday <= 7
                    ? "text-amber-500"
                    : "text-gray-400";
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => onTapAudition(a.id)}
                    className="flex w-full items-start justify-between gap-3 rounded-xl border border-gray-200 px-4 py-3.5 text-left transition-colors active:bg-gray-50"
                  >
                    <div className="min-w-0 flex-1">
                      <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-gray-900">
                        {a.title}
                      </h3>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        {a.company && (
                          <span className="max-w-[140px] truncate text-[12px] text-gray-400">
                            {a.company}
                          </span>
                        )}
                        <Badge className="bg-gray-100 text-gray-500">{a.genre}</Badge>
                        {a.apply_type === "email" && <Badge>원클릭 지원</Badge>}
                      </div>
                    </div>
                    <span className={cn("shrink-0 text-[13px] font-semibold tabular-nums", ddayColor)}>
                      {formatDday(a.deadline)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
