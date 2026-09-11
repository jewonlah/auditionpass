"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export default function ResetPasswordPage() {
  const { user, loading } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  async function save(event: React.FormEvent) {
    event.preventDefault(); setError("");
    if (password !== confirm) { setError("비밀번호가 서로 다릅니다."); return; }
    setBusy(true);
    try {
      const db = createClient();
      const { error: updateError } = await db.auth.updateUser({ password });
      if (updateError) throw updateError;
      setDone(true); setPassword(""); setConfirm("");
      await db.auth.signOut();
    } catch { setError("비밀번호를 변경하지 못했습니다. 새 비밀번호를 확인하거나 안내 메일을 다시 요청해주세요."); }
    finally { setBusy(false); }
  }
  return <div className="mx-auto flex min-h-screen max-w-md items-center px-5"><div className="w-full">
    <h1 className="text-2xl font-bold">{done ? "비밀번호를 변경했어요" : "새 비밀번호 설정"}</h1>
    {loading ? <p className="mt-4" role="status">인증을 확인하고 있어요.</p> : done ? <Link className="mt-5 block py-3 text-primary" href="/login">새 비밀번호로 로그인하기</Link> : !user ? <p className="mt-4 text-sm">인증 링크가 필요해요. <Link className="font-semibold text-primary" href="/forgot-password">안내 메일 다시 받기</Link></p> : <form onSubmit={save} className="mt-6 space-y-4">
      <Input id="new-password" label="새 비밀번호" type="password" autoComplete="new-password" minLength={8} maxLength={72} required value={password} onChange={(e) => setPassword(e.target.value)} />
      <Input id="confirm-password" label="새 비밀번호 확인" type="password" autoComplete="new-password" minLength={8} maxLength={72} required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      <p className="text-sm text-gray-500">8자 이상 입력해주세요.</p>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <Button type="submit" className="w-full" disabled={busy}>{busy ? "변경 중…" : "비밀번호 변경"}</Button>
    </form>}
  </div></div>;
}
