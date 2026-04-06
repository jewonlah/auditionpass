"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";

const loginSchema = z.object({
  email: z.string().email("올바른 이메일을 입력해주세요"),
  password: z.string().min(6, "비밀번호는 6자 이상이어야 합니다"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState("");

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

    router.push("/auditions");
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

        {/* 회원가입 링크 */}
        <p className="mt-6 text-center text-sm text-gray-500">
          아직 계정이 없으신가요?{" "}
          <Link
            href="/signup"
            className="font-semibold text-primary hover:underline"
          >
            회원가입
          </Link>
        </p>
      </div>
    </div>
  );
}
