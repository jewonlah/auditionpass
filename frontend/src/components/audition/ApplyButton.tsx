"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Send,
  CheckCircle,
  Mail,
  Building2,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { createClient } from "@/lib/supabase/client";
import {
  PROFILE_GENRES,
  type MiniProfileField,
} from "@/lib/profile";
import { withReturnTo } from "@/lib/utils";
import { track } from "@/lib/analytics";
import type { Audition } from "@/types";
import type { ReadinessIssue } from "@/lib/apply/readiness";
import type { SubjectRules } from "@/lib/apply/subject";
import { ProfilePdf } from "@/components/profile/ProfilePdf";
import { MaterialAttachmentPicker } from "./MaterialAttachmentPicker";

interface ProfileSummary {
  profileVersionId?: string | null;
  documentVersion?: number | null;
  name: string;
  birthYear: number | null;
  age: number | null;
  gender: string | null;
  genre: string[];
  photoCount: number;
  agency: string | null;
}

interface ApplyCheck {
  readiness: { issues: ReadinessIssue[]; subjectRules?: SubjectRules | null } | null;
  loading: boolean;
  hasApplied: boolean;
  isSending: boolean;
  isStopped: boolean;
  error: boolean;
  missingFields: MiniProfileField[];
  profileSummary: ProfileSummary | null;
}

const INITIAL_CHECK: ApplyCheck = {
  readiness: null,
  loading: true,
  hasApplied: false,
  isSending: false,
  isStopped: false,
  error: false,
  missingFields: [],
  profileSummary: null,
};

type SheetStep = null | "login" | "profile" | "prepare" | "confirm" | "success";

interface ApplyButtonProps {
  // apply_email 은 서버가 클라이언트로 내보내지 않는다(36 §4 이메일 비노출).
  // 값이 없을 수 있으므로 선택 필드로 둔다 — 화면 표시는 이미 조건부다.
  audition: Pick<Audition, "id" | "title" | "company" | "genre"> & {
    apply_email?: string | null;
    source_url?: string | null;
  };
  isLoggedIn: boolean;
  authLoading: boolean;
}

/**
 * F5 지원 플로우 — 인라인 바텀시트 게이트 (11_prd F5)
 * 상태 머신: 비로그인 → 시트 ⓐ(로그인) / 미니 프로필 미완 → 시트 ⓑ(부족 필드만) /
 * 완료 → 시트 ⓒ(확인·발송) → 성공 시트. 전 과정 페이지 이탈 0.
 */
export function ApplyButton({ audition, isLoggedIn, authLoading }: ApplyButtonProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [check, setCheck] = useState<ApplyCheck>(INITIAL_CHECK);
  const [step, setStep] = useState<SheetStep>(null);
  const autoOpened = useRef(false);

  const fetchCheck = useCallback(async (): Promise<ApplyCheck> => {
    try {
      const res = await fetch(`/api/apply/check?auditionId=${audition.id}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      const next: ApplyCheck = {
        loading: false,
        readiness: data.readiness ?? null,
        hasApplied: data.hasApplied,
        isSending: data.isSending === true,
        isStopped: data.isStopped === true,
        error: false,
        missingFields: data.missingFields ?? [],
        profileSummary: data.profileSummary ?? null,
      };
      setCheck(next);
      return next;
    } catch {
      const next = { ...INITIAL_CHECK, loading: false, error: true };
      setCheck(next);
      return next;
    }
  }, [audition.id]);

  useEffect(() => {
    if (authLoading) return;
    if (!isLoggedIn) {
      setCheck({ ...INITIAL_CHECK, loading: false });
      return;
    }
    fetchCheck();
  }, [isLoggedIn, authLoading, fetchCheck]);

  /** 현재 상태에 맞는 게이트 스텝 결정 (12 §5 매트릭스) */
  const resolveStep = useCallback(
    (c: ApplyCheck, loggedIn: boolean): SheetStep => {
      if (!loggedIn) return "login";
      if (c.hasApplied || c.isSending || c.isStopped || c.error) return null;
      if (c.missingFields.length > 0) return "profile";
      if (!c.readiness || c.readiness.issues.length) return "prepare";
      return "confirm";
    },
    []
  );

  // F3: OAuth·로그인 왕복 복귀 시 ?apply=1 감지 → 시트 자동 재오픈 (1회)
  useEffect(() => {
    if (autoOpened.current) return;
    if (searchParams.get("apply") !== "1") return;
    if (authLoading || check.loading) return;

    autoOpened.current = true;
    // 파라미터 소비 — 새로고침 시 재오픈 방지. router.replace는 RSC 내비게이션으로
    // Suspense 경계를 리셋해 시트 상태가 유실되므로 shallow replaceState 사용.
    window.history.replaceState(window.history.state, "", pathname);
    const next = resolveStep(check, isLoggedIn);
    if (next) setStep(next);
  }, [searchParams, authLoading, check, isLoggedIn, resolveStep, pathname]);

  async function handleApplyTap() {
    const next = resolveStep(isLoggedIn ? await fetchCheck() : check, isLoggedIn);
    if (next === "login") track("apply_gate_blocked", { reason: "NOT_LOGGED_IN" });
    if (next === "profile") track("apply_gate_blocked", { reason: "INCOMPLETE_PROFILE" });
    if (next) setStep(next);
  }

  const closeSheet = useCallback(() => setStep(null), []);

  // 시트 내 로그인 성공 → 같은 시트에서 다음 단계로 (수용 기준 1).
  // router.refresh()는 시트 플로우를 끊을 수 있어 호출하지 않는다 —
  // 헤더 등 로그인 UI는 useAuth(onAuthStateChange)로 자체 갱신된다.
  const handleLoggedIn = useCallback(async () => {
    const fresh = await fetchCheck();
    setStep(resolveStep(fresh, true));
  }, [fetchCheck, resolveStep]);

  // 시트 ⓑ 저장 성공 → 확인 단계로
  const handleProfileSaved = useCallback(async () => {
    const fresh = await fetchCheck();
    setStep(resolveStep(fresh, true));
  }, [fetchCheck, resolveStep]);

  const handleSent = useCallback(() => {
    setCheck((prev) => ({ ...prev, hasApplied: true }));
    setStep("success");
  }, []);

  if (authLoading || (isLoggedIn && check.loading)) {
    return <div className="h-12 animate-pulse rounded-xl bg-gray-200" />;
  }

  if (check.error) return <Button variant="outline" className="w-full" onClick={() => fetchCheck()}>지원 정보 다시 확인하기</Button>;
  if (check.isStopped) return <Link href="/applications" className="block rounded-xl bg-gray-100 p-3 text-center text-sm font-semibold">추가 발송 중지 · 지원 내역 보기</Link>;
  if (check.isSending) return <Link href="/applications" className="block rounded-xl bg-gray-100 px-4 py-3 text-center text-sm font-semibold">발송 결과 확인 중 · 지원 내역 보기</Link>;

  // 이미 지원 완료 (수용 기준 5)
  if (check.hasApplied && step !== "success") {
    return (
      <Button variant="outline" disabled className="w-full gap-2">
        <CheckCircle size={18} />
        지원함
      </Button>
    );
  }

  return (
    <>
      <Button
        variant="accent"
        size="lg"
        className="w-full gap-2"
        onClick={handleApplyTap}
      >
        <Send size={18} />
        지원 준비
      </Button>

      <BottomSheet
        open={step !== null}
        onClose={closeSheet}
        title={
          step === "login"
            ? "지원하려면 로그인이 필요해요"
            : step === "profile"
              ? "지원 전 몇 가지만 채워주세요"
              : step === "prepare"
                ? "지원 준비를 이어가세요"
              : step === "confirm"
                ? "이 프로필로 지원할까요?"
                : step === "success"
                  ? undefined
                  : undefined
        }
      >
        {step === "login" && (
          <LoginStep
            returnPath={`${pathname}?apply=1`}
            onLoggedIn={handleLoggedIn}
          />
        )}
        {step === "profile" && (
          <ProfileStep
            missingFields={check.missingFields}
            hasProfile={check.profileSummary !== null}
            onSaved={handleProfileSaved}
          />
        )}
        {step === "prepare" && <div className="space-y-4 pb-3">
          <p className="text-base font-semibold">{audition.title}</p>
          <ul className="space-y-3">{check.readiness?.issues.map((issue, i) => <li key={`${issue.code}-${i}`} className="rounded-xl bg-gray-50 p-3 text-base">{issue.message}</li>)}</ul>
          {check.readiness?.issues.some(i => i.target === "profile") && <Link href={withReturnTo("/profile", `${pathname}?apply=1`)} className="app-primary flex min-h-11 items-center justify-center bg-primary p-3 font-semibold text-white">사진·연락처 보완하기</Link>}
          {audition.source_url && <a href={audition.source_url} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center justify-center font-semibold text-primary">원문 접수 방법 확인</a>}
          <Button variant="outline" className="w-full" onClick={handleProfileSaved}>준비 상태 다시 확인</Button>
        </div>}
        {step === "confirm" && (
          <ConfirmStep
            audition={audition}
            summary={check.profileSummary}
            subjectRules={check.readiness?.subjectRules ?? null}
            onSent={handleSent}
          />
        )}
        {step === "success" && <SuccessStep audition={audition} />}
      </BottomSheet>
    </>
  );
}

/* ─── 시트 ⓐ: 로그인 (12 §6.2 #2 — returnTo+apply=1) ─── */

function LoginStep({
  returnPath,
  onLoggedIn,
}: {
  returnPath: string;
  onLoggedIn: () => Promise<void>;
}) {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setSubmitting(false);
      setError(
        authError.message.includes("Invalid login credentials")
          ? "이메일 또는 비밀번호가 올바르지 않습니다."
          : authError.message.includes("Email not confirmed")
            ? "이메일 인증을 완료해주세요. 메일함을 확인하세요."
            : "로그인에 실패했습니다. 다시 시도해주세요."
      );
      return;
    }

    await onLoggedIn();
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleLogin} className="space-y-3 pb-2">
      <p className="text-sm text-gray-500">
        로그인하면 이 자리에서 바로 지원을 이어갈 수 있어요.
      </p>

      {/* 구글 OAuth — 12 §6.2 게이트 시트 ⓐ. returnTo 에 `apply=1` 이 붙어 있어
          왕복 후 이 상세로 돌아오면 지원 시트가 자동 재오픈된다. */}
      <GoogleButton returnTo={returnPath} label="Google로 계속하기" />

      <div className="flex items-center gap-3 pt-1">
        <span className="h-px flex-1 bg-gray-200" />
        <span className="text-xs text-gray-400">또는 이메일로 로그인</span>
        <span className="h-px flex-1 bg-gray-200" />
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <Input
        type="email"
        placeholder="이메일"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <Input
        type="password"
        placeholder="비밀번호"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />

      <Button
        type="submit"
        variant="accent"
        size="lg"
        className="w-full gap-2"
        disabled={submitting}
      >
        <Mail size={17} />
        {submitting ? "로그인 중..." : "로그인하고 지원 계속하기"}
      </Button>

      <p className="pt-1 text-center text-sm text-gray-500">
        아직 계정이 없으신가요?{" "}
        <Link
          href={withReturnTo("/signup", returnPath)}
          className="font-semibold text-primary"
        >
          회원가입
        </Link>
      </p>
    </form>
  );
}

/* ─── 시트 ⓑ: 미니 프로필 — 부족한 필드만 (수용 기준 2) ─── */

const GENDERS = ["남성", "여성", "기타"] as const;
const THIS_YEAR = new Date().getFullYear();

function ProfileStep({
  missingFields,
  hasProfile,
  onSaved,
}: {
  missingFields: MiniProfileField[];
  hasProfile: boolean;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [gender, setGender] = useState("");
  const [genres, setGenres] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const need = (f: MiniProfileField) => missingFields.includes(f);

  function validate(): string {
    if (need("name") && !name.trim()) return "이름을 입력해주세요.";
    if (need("birth_year")) {
      const y = Number(birthYear);
      if (!y || y < 1940 || y > THIS_YEAR - 14)
        return "올바른 출생연도를 입력해주세요. (14세 이상)";
    }
    if (need("gender") && !gender) return "성별을 선택해주세요.";
    if (need("genre") && genres.length === 0) return "분야를 하나 이상 선택해주세요.";
    return "";
  }

  async function handleSave() {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError("");
    setSubmitting(true);

    const payload: Record<string, unknown> = {};
    if (need("name")) payload.name = name.trim();
    if (need("birth_year")) payload.birth_year = Number(birthYear);
    if (need("gender")) payload.gender = gender;
    if (need("genre")) payload.genre = genres;

    try {
      const res = await fetch("/api/profile", {
        method: hasProfile ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "저장에 실패했습니다. 다시 시도해주세요.");
        setSubmitting(false);
        return;
      }

      await onSaved();
    } catch {
      setError("네트워크 오류가 발생했습니다. 다시 시도해주세요.");
    }
    setSubmitting(false);
  }

  return (
    <div className="space-y-4 pb-2">
      <p className="text-sm text-gray-500">
        지원 메일에 들어가는 최소 정보예요. 30초면 충분해요.
      </p>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {need("name") && (
        <Input
          label="이름"
          placeholder="실명을 입력해주세요"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      )}

      {need("birth_year") && (
        <Input
          label="출생연도"
          type="number"
          inputMode="numeric"
          placeholder="2004"
          value={birthYear}
          onChange={(e) => setBirthYear(e.target.value)}
        />
      )}

      {need("gender") && (
        <div>
          <p className="mb-1.5 text-sm font-medium text-gray-700">성별</p>
          <div className="grid grid-cols-3 gap-2">
            {GENDERS.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGender(g)}
                className={`min-h-11 rounded-lg border py-2.5 text-sm font-medium transition-colors ${
                  gender === g
                    ? "border-primary bg-red-50 text-primary"
                    : "border-gray-300 text-gray-600 active:bg-gray-50"
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
      )}

      {need("genre") && (
        <div>
          <p className="mb-1.5 text-sm font-medium text-gray-700">
            분야 <span className="font-normal text-gray-400">(복수 선택 가능)</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {PROFILE_GENRES.map((g) => {
              const active = genres.includes(g);
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() =>
                    setGenres((prev) =>
                      active ? prev.filter((v) => v !== g) : [...prev, g]
                    )
                  }
                  className={`min-h-10 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "border-primary bg-red-50 text-primary"
                      : "border-gray-300 text-gray-600 active:bg-gray-50"
                  }`}
                >
                  {g}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <Button
        variant="accent"
        size="lg"
        className="w-full"
        onClick={handleSave}
        disabled={submitting}
      >
        {submitting ? "저장 중..." : "저장하고 지원 계속하기"}
      </Button>
    </div>
  );
}

/* ─── 시트 ⓒ: 지원 확인 → 발송 (발송 실패 시 인라인 재시도) ─── */

function ConfirmStep({
  audition,
  summary,
  subjectRules,
  onSent,
}: {
  audition: Pick<Audition, "id" | "title" | "company"> & {
    apply_email?: string | null;
    source_url?: string | null;
  };
  summary: ProfileSummary | null;
  subjectRules: SubjectRules | null;
  onSent: () => void;
}) {
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pending, setPending] = useState(false);
  const [consent, setConsent] = useState(false);
  const [pdfReady, setPdfReady] = useState(false);
  const onPdfReady = useCallback(() => setPdfReady(true), []);
  const [materialIds, setMaterialIds] = useState<string[]>([]);
  const [role, setRole] = useState("");
  const [declaredAge, setDeclaredAge] = useState("");
  const customSubject = subjectRules?.format === "role_name_age_phone_v1";
  const roleInputId = useId();
  const subjectComplete = !customSubject || (subjectRules.roles.includes(role) && /^\d{2,3}$/.test(declaredAge) && Number(declaredAge) >= 19 && Number(declaredAge) <= 120);
  function resetPreparation() { setPreparation(null); setConsent(false); setError(""); }

  const [preparation, setPreparation] = useState<{ preparationId: string; recipient: string; replyTo?: string; subject: string; attachments: string[]; role?: string; declaredAge?: number } | null>(null);
  async function handlePrepare() {
    setSubmitting(true); setError(""); setConsent(false); setPreparation(null);
    try {
      const res = await fetch("/api/apply/prepare", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auditionId: audition.id, expectedProfileVersion: summary?.documentVersion, materialIds, ...(customSubject ? { role, declaredAge: Number(declaredAge) } : {}) }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "제출 자료를 준비하지 못했어요.");
      setPreparation(data);
    } catch (e) { setError(e instanceof Error ? e.message : "연결을 확인해주세요."); }
    finally { setSubmitting(false); }
  }

  async function handleSend() {
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preparationId: preparation?.preparationId, consent }),
      });
      const data = await res.json();

      if (data.pending || data.code === "APPLY_IN_PROGRESS" || data.code === "MANUAL_REVIEW") {
        setPending(true);
        setError(data.error || "발송 결과를 확인 중입니다.");
      } else if (res.ok && data.success) {
        track("apply_send", { audition_id: audition.id });
        onSent();
        return;
      }
      if (data.code === "ALREADY_APPLIED") {
        setPending(true); setError("기존 지원 기록이 있어요. 지원 내역에서 상태를 확인해주세요."); setSubmitting(false); return;
      }
      if (!res.ok && !data.pending) { setPreparation(null); setConsent(false); }
      setError(data.error || "발송에 실패했습니다. 다시 시도해주세요.");
    } catch {
      setError("네트워크 오류가 발생했습니다. 다시 시도해주세요.");
    }
    setSubmitting(false);
  }

  const ageLabel = summary?.birthYear
    ? `${summary.birthYear}년생`
    : summary?.age
      ? `${summary.age}세`
      : null;

  return (
    <div className="space-y-4 pb-2">
      {/* 수신자 */}
      <div className="rounded-xl bg-gray-50 p-4">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">
          받는 곳
        </p>
        <div className="flex items-center gap-2 text-sm text-gray-900">
          <Building2 size={15} className="shrink-0 text-gray-400" />
          <span className="font-semibold">
            {audition.company || audition.title}
          </span>
        </div>
        {preparation?.recipient && (
          <p className="mt-0.5 pl-[23px] text-sm text-gray-500">
            {preparation.recipient}
          </p>
        )}
      </div>

      {/* 첨부 프로필 요약 (발송 메일 스냅샷) */}
      {summary?.profileVersionId && <ProfilePdf key={summary.profileVersionId} versionId={summary.profileVersionId} onReady={onPdfReady} />}
      {summary && (
        <div className="rounded-xl border border-gray-200 p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
            메일에 담기는 프로필
          </p>
          <p className="text-[15px] font-semibold text-gray-900">
            {summary.name}
            <span className="ml-2 font-normal text-gray-500">
              {[summary.gender, ageLabel].filter(Boolean).join(" · ")}
            </span>
          </p>
          {summary.genre.length > 0 && (
            <p className="mt-1 text-sm text-gray-500">
              {summary.genre.join(", ")}
            </p>
          )}
          <p className="mt-1 text-sm text-gray-500">
            사진 {summary.photoCount}장
            {summary.agency ? ` · ${summary.agency}` : ""}
          </p>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {customSubject && <fieldset className="space-y-3 rounded-xl border border-gray-200 p-4" disabled={submitting || pending}>
        <legend className="px-1 text-sm font-semibold">공고에서 요청한 메일 제목</legend>
        <div>
          <label htmlFor={roleInputId} className="block text-sm font-medium">지원 배역</label>
          <select id={roleInputId} className="mt-1 block min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-base" value={role} onChange={e => { setRole(e.target.value); resetPreparation(); }}>
            <option value="">배역을 선택해주세요</option>
            {subjectRules.roles.map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </div>
        <Input label="현재 만 나이" type="number" inputMode="numeric" min={19} max={120} step={1} value={declaredAge} onChange={e => { setDeclaredAge(e.target.value); resetPreparation(); }} />
        <p className="text-sm text-gray-600">생일이 지났는지 확인해 직접 입력해주세요. 저장한 이름·연락처와 함께 메일 제목에 들어갑니다.</p>
      </fieldset>}
      <label className="flex items-start gap-3 text-base leading-relaxed"><input type="checkbox" className="mt-1 size-5 shrink-0 accent-primary" disabled={!preparation || submitting || pending} checked={consent} onChange={e => setConsent(e.target.checked)} /><span>이 공고의 접수처로 프로필의 이름·연락처·사진·이력과 선택한 자료를 보내는 데 동의합니다.{customSubject && preparation && ` 지원 배역 ‘${preparation.role}’과 본인이 확인한 만 ${preparation.declaredAge}세를 제목에 포함합니다.`}</span></label>
      <MaterialAttachmentPicker selected={materialIds} onChange={ids => { setMaterialIds(ids); setPreparation(null); setConsent(false); }} disabled={submitting || pending} />
      {!preparation && <Button className="w-full" variant="outline" onClick={handlePrepare} disabled={!pdfReady || !subjectComplete || submitting || pending}>{submitting ? "제출 자료 확인 중…" : "수신처와 첨부파일 확인하기"}</Button>}
      {preparation && <div className="rounded-xl bg-gray-50 p-4 text-sm space-y-2"><p>받는 곳: {preparation.recipient}</p><p>답장받을 주소: {preparation.replyTo || "확인 필요"}</p><p>메일 제목: {preparation.subject}</p><p>첨부: {preparation.attachments.join(", ")}</p><p>위 자료를 확인한 뒤 정보 전달에 동의해주세요.</p></div>}
      <Button
        variant="accent"
        size="lg"
        className="w-full gap-2"
        onClick={handleSend}
        disabled={submitting || pending || !consent || !pdfReady || !preparation}
      >
        <Send size={17} />
        {submitting ? "발송 중…" : !pdfReady ? "제출 PDF를 먼저 확인해주세요" : "이 내용으로 지원 보내기"}
      </Button>
      {pending && <Link href="/applications" className="block py-3 text-center text-sm font-semibold text-primary">지원 내역에서 결과 확인하기</Link>}
    </div>
  );
}

/* ─── 성공 시트: 다음 행동 2개 (수용 기준 3) ─── */

function SuccessStep({ audition }: { audition: Pick<Audition, "genre"> }) {
  const router = useRouter();
  // 시트가 쌓아둔 더미 히스토리 엔트리를 새 목적지로 덮어쓴다 — onClose 후 push는
  // BottomSheet의 back()과 경합해 내비게이션이 취소되므로 replace만 사용.
  const navigate = (path: string) => router.replace(path);

  return (
    <div className="pb-2 text-center">
      <div className="mx-auto mb-3 mt-1 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
        <CheckCircle size={30} className="text-emerald-500" />
      </div>
      <h2 className="text-lg font-bold text-gray-900">발송 요청 접수</h2>
      <p className="mt-1 mb-5 text-sm text-gray-500">
        메일 발송 요청을 접수했어요. 수신 여부와 회신은 별도로 확인해주세요.
      </p>

      <div className="space-y-2">
        <Button
          variant="accent"
          size="lg"
          className="w-full gap-1"
          onClick={() => navigate("/applications")}
        >
          지원 탭에서 추적하기
          <ChevronRight size={17} />
        </Button>
        <Button
          variant="ghost"
          size="lg"
          className="w-full"
          onClick={() =>
            navigate(`/auditions?filter=${encodeURIComponent(audition.genre)}`)
          }
        >
          비슷한 오디션 더 보기
        </Button>
      </div>
    </div>
  );
}
