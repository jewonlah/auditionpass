"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { resolveReturnTo, withReturnTo } from "@/lib/utils";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { Mail, Eye, EyeOff } from "lucide-react";

const loginSchema = z.object({
  email: z.string().email("올바른 이메일을 입력해주세요"),
  password: z.string().min(6, "비밀번호는 6자 이상이어야 합니다"),
});

type LoginForm = z.infer<typeof loginSchema>;

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState("");

  // F3: returnTo 소비 — 내부 경로만 허용, 폴백 /home
  const rawReturnTo = searchParams.get("returnTo");
  const returnTo = resolveReturnTo(rawReturnTo, "/home");

  // 인증 콜백이 실패 사유를 실어 보낸다 (2026-08-29). 그전에는 만료된 링크를 눌러도
  // 아무 설명 없이 로그인 화면만 떠서, 사용자가 원인을 모른 채 재가입을 반복했다.
  const authError = searchParams.get("error");
  const authNotice =
    authError === "expired_link"
      ? "인증 링크가 만료되었거나 이미 사용되었습니다. 아래에서 다시 로그인하거나 가입을 다시 진행해 주세요."
      : authError === "auth_failed" || authError === "missing_code"
        ? "인증에 실패했습니다. 다시 시도해 주세요."
        : null;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  async function onSubmit(data: LoginForm) {
    setServerError("");

    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

    if (error) {
      if (error.message.includes("Invalid login credentials")) {
        setServerError("이메일 또는 비밀번호가 올바르지 않습니다.");
      } else if (error.message.includes("Email not confirmed")) {
        setServerError("이메일 인증을 완료해주세요. 메일함을 확인하세요.");
      } else {
        setServerError("로그인에 실패했습니다. 다시 시도해주세요.");
      }
      return;
    }

    router.push(returnTo);
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4">
      <div className="w-full">
        {/* 로고 */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary mb-2">오디션패스</h1>
          <p className="text-gray-500">로그인하고 오디션에 지원하세요</p>
        </div>

        {/* 인증 콜백 안내 — 이메일/구글 어느 쪽이든 공통이라 폼 밖에 둔다 */}
        {authNotice && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
            {authNotice}
          </div>
        )}

        {/* 구글 OAuth — 주 동선 (12_ia-userflows §2.1 "구글 OAuth(주) + 이메일(보조)") */}
        <GoogleButton returnTo={rawReturnTo} label="Google로 계속하기" />

        <div className="my-5 flex items-center gap-3">
          <span className="h-px flex-1 bg-gray-200" />
          <span className="text-xs text-gray-400">또는 이메일로 로그인</span>
          <span className="h-px flex-1 bg-gray-200" />
        </div>

        {/* 로그인 폼 */}
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

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={isSubmitting}
          >
            {isSubmitting ? "로그인 중..." : "로그인"}
          </Button>
        </form>

        {/* 회원가입 링크 — returnTo 릴레이 */}
        <p className="mt-6 text-center text-sm text-gray-500">
          아직 계정이 없으신가요?{" "}
          <Link
            href={rawReturnTo ? withReturnTo("/signup", returnTo) : "/signup"}
            className="font-semibold text-primary hover:underline"
          >
            회원가입
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}
