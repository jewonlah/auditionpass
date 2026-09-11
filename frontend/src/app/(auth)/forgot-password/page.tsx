"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { resolveReturnTo, withReturnTo } from "@/lib/utils";

export default function Page() { return <Suspense><AccountHelp /></Suspense>; }
function AccountHelp() {
  const params = useSearchParams();
  const returnTo = resolveReturnTo(params.get("returnTo"), "/home");
  const [email, setEmail] = useState("");
  const [mode, setMode] = useState<"password" | "confirm">("password");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sentAt, setSentAt] = useState(0);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(""); setMessage("");
    if (Date.now() - sentAt < 60_000) { setError("메일은 1분에 한 번 요청할 수 있어요. 잠시 후 다시 시도해주세요."); return; }
    setBusy(true);
    try {
      const db = createClient();
      const callback = window.location.origin + "/auth/callback?returnTo=" + encodeURIComponent(mode === "password" ? "/reset-password" : returnTo);
      const result = mode === "password"
        ? await db.auth.resetPasswordForEmail(email.trim(), { redirectTo: callback })
        : await db.auth.resend({ type: "signup", email: email.trim(), options: { emailRedirectTo: callback } });
      if (result.error) throw result.error;
      setSentAt(Date.now());
      setMessage("해당 이메일로 처리할 수 있는 계정이 있으면 안내 메일을 보내드립니다. 스팸함도 확인해주세요.");
    } catch { setError("메일을 요청하지 못했습니다. 잠시 후 다시 시도해주세요."); }
    finally { setBusy(false); }
  }
  return <div className="mx-auto flex min-h-screen max-w-md items-center px-5 py-10"><div className="w-full">
    <h1 className="text-2xl font-bold">계정에 다시 연결하기</h1>
    <p className="mt-2 text-sm leading-relaxed text-gray-500">가입한 이메일로 비밀번호를 바꾸거나 인증 메일을 다시 받을 수 있어요.</p>
    <div className="my-6 grid grid-cols-2 gap-2">{(["password", "confirm"] as const).map((value) => <button key={value} type="button" disabled={busy} aria-pressed={mode === value} onClick={() => { setMode(value); setMessage(""); setError(""); }} className={"min-h-11 rounded-lg border text-sm font-semibold " + (mode === value ? "border-primary text-primary" : "border-gray-200 text-gray-500")}>{value === "password" ? "비밀번호 재설정" : "가입 인증 메일"}</button>)}</div>
    <form onSubmit={submit} className="space-y-4">
      <Input id="recovery-email" label="가입한 이메일" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      <Button type="submit" className="w-full" disabled={busy}>{busy ? "요청 중…" : "안내 메일 받기"}</Button>
      {message && <p role="status" className="rounded-xl bg-gray-100 p-4 text-sm leading-relaxed">{message}</p>}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </form>
    <Link href={withReturnTo("/login", returnTo)} className="mt-6 block py-3 text-center text-sm font-semibold text-gray-600">로그인으로 돌아가기</Link>
  </div></div>;
}
