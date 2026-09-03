"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { resolveReturnTo, withReturnTo } from "@/lib/utils";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { Mail, Eye, EyeOff, CheckCircle } from "lucide-react";
import { readAttribution } from "@/components/Attribution";

const signupSchema = z
  .object({
    email: z.string().email("올바른 이메일을 입력해주세요"),
    password: z.string().min(6, "비밀번호는 6자 이상이어야 합니다"),
    passwordConfirm: z.string(),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: "비밀번호가 일치하지 않습니다",
    path: ["passwordConfirm"],
  });

type SignupForm = z.infer<typeof signupSchema>;

function SignupContent() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState("");
  const [emailSent, setEmailSent] = useState(false);

  // F3: 이메일 인증 왕복에도 returnTo 유지 — 콜백 URL에 릴레이
  const rawReturnTo = searchParams.get("returnTo");
  const returnTo = resolveReturnTo(rawReturnTo, "/home");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupForm>({
    resolver: zodResolver(signupSchema),
  });

  async function onSubmit(data: SignupForm) {
    setServerError("");

    // 최초 유입 경로를 가입에 붙인다 — 없으면 이 사람이 어디서 왔는지 영영 알 수 없다.
    // (Vercel Analytics 는 전체 방문 기준이라 개별 가입자와 연결되지 않는다)
    const attribution = readAttribution();

    const { data: signUpData, error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        emailRedirectTo: rawReturnTo
          ? `${window.location.origin}/auth/callback?returnTo=${encodeURIComponent(returnTo)}`
          : `${window.location.origin}/auth/callback`,
        data: attribution
          ? {
              signup_source: attribution.source,
              signup_referrer: attribution.referrer,
              signup_landing: attribution.landing,
              ...attribution.utm,
            }
          : { signup_source: "direct" },
      },
    });

    if (error) {
      if (error.message.includes("already registered")) {
        setServerError("이미 가입된 이메일입니다. 로그인해주세요.");
      } else {
        setServerError("회원가입에 실패했습니다. 다시 시도해주세요.");
      }
      return;
    }

    // 이미 가입된 이메일 판별 (2026-08-29 추가).
    // 이메일 확인이 켜져 있으면 GoTrue 는 사용자 열거를 막기 위해 **에러 없이**
    // identities 가 빈 가짜 user 를 돌려준다. 그래서 위 error.message 분기는 발화하지 않고,
    // 기존 가입자가 재가입을 시도하면 오지 않을 메일을 계속 기다리게 된다.
    if (signUpData.user && signUpData.user.identities?.length === 0) {
      setServerError("이미 가입된 이메일입니다. 로그인해주세요.");
      return;
    }

    // 이메일 확인이 꺼져 있으면 signUp 이 즉시 세션을 준다. 이때 "메일함을 확인하세요"를
    // 띄우면 이미 로그인된 사용자가 오지 않을 메일을 기다리는 데드엔드가 된다.
    if (signUpData.session) {
      window.location.assign(returnTo);
      return;
    }

    setEmailSent(true);
  }

  // 인증 메일 발송 완료 화면
  if (emailSent) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4">
        <div className="w-full text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <CheckCircle size={32} className="text-green-600" />
          </div>
          <h1 className="text-2xl font-bold mb-2">인증 메일을 확인해주세요</h1>
          <p className="text-gray-500 mb-6">
            입력하신 이메일로 인증 링크를 발송했습니다.
            <br />
            메일함을 확인하고 링크를 클릭해주세요.
          </p>
          <p className="text-sm text-gray-400 mb-8">
            메일이 오지 않았다면 스팸함도 확인해보세요.
          </p>
          <Link
            href={rawReturnTo ? withReturnTo("/login", returnTo) : "/login"}
            className="inline-flex items-center justify-center rounded-lg bg-primary px-6 py-2.5 font-semibold text-white hover:bg-primary-hover transition-colors"
          >
            로그인 페이지로 이동
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4">
      <div className="w-full">
        {/* 로고 */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary mb-2">회원가입</h1>
          <p className="text-gray-500">오디션패스에 가입하고 지원을 시작하세요</p>
        </div>

        {/* 구글 OAuth — 가입 화면 최상단 (11_prd F4 SHOULD, D8 R1은 구글만).
            이메일 더블 옵트인의 메일함 이탈을 건너뛰는 주 동선이다. */}
        <GoogleButton returnTo={rawReturnTo} label="Google로 시작하기" />

        <div className="my-5 flex items-center gap-3">
          <span className="h-px flex-1 bg-gray-200" />
          <span className="text-xs text-gray-400">또는 이메일로 가입</span>
          <span className="h-px flex-1 bg-gray-200" />
        </div>

        {/* 회원가입 폼 */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {serverError && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">
              {serverError}
            </div>
          )}

          <div className="relative">
            <Input
              label="이메일"
              type="email"
              placeholder="email@example.com"
              error={errors.email?.message}
              {...register("email")}
            />
            <Mail
              size={18}
              className="absolute right-3 top-[38px] text-gray-400 pointer-events-none"
            />
          </div>

          <div className="relative">
            <Input
              label="비밀번호"
              type={showPassword ? "text" : "password"}
              placeholder="6자 이상 입력"
              error={errors.password?.message}
              {...register("password")}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-[38px] text-gray-400 hover:text-gray-600"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          <div>
            <Input
              label="비밀번호 확인"
              type={showPassword ? "text" : "password"}
              placeholder="비밀번호를 다시 입력"
              error={errors.passwordConfirm?.message}
              {...register("passwordConfirm")}
            />
          </div>

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={isSubmitting}
          >
            {isSubmitting ? "가입 중..." : "회원가입"}
          </Button>
        </form>

        {/* 로그인 링크 — returnTo 릴레이 */}
        <p className="mt-6 text-center text-sm text-gray-500">
          이미 계정이 있으신가요?{" "}
          <Link
            href={rawReturnTo ? withReturnTo("/login", returnTo) : "/login"}
            className="font-semibold text-primary hover:underline"
          >
            로그인
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupContent />
    </Suspense>
  );
}
