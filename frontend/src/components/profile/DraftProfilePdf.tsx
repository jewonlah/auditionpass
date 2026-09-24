"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { PdfPages } from "./PdfPages";
import type { Profile } from "@/types";

export function DraftProfilePdf({ profile }: { profile: Partial<Profile> }) {
  const [result, setResult] = useState<{ url: string; input: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const input = JSON.stringify(profile);
  useEffect(() => () => { controller.current?.abort(); }, []);
  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);
  async function preview() {
    controller.current?.abort(); const pending = new AbortController(); controller.current = pending;
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/profile/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: input, signal: pending.signal });
      if (!response.ok) throw new Error((await response.json()).error);
      const blob = await response.blob();
      if (!pending.signal.aborted) setResult({ url: URL.createObjectURL(blob), input });
    } catch (e) { if (!pending.signal.aborted) setError(e instanceof Error ? e.message : "미리보기를 불러오지 못했어요."); }
    finally { if (!pending.signal.aborted) setLoading(false); }
  }
  return <section className="space-y-3" aria-label="편집 중인 PDF">
    <Button type="button" variant="outline" className="w-full" disabled={loading} onClick={preview}>{loading ? "PDF 만드는 중…" : "이 내용으로 PDF 미리보기"}</Button>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {result && result.input !== input && <p role="status" className="text-sm text-gray-600">내용이 바뀌었어요. PDF를 다시 확인해주세요.</p>}
    {result && result.input === input && <><PdfPages url={result.url} /><a className="inline-flex min-h-11 items-center font-semibold text-primary" href={result.url} target="_blank" rel="noopener noreferrer">PDF 크게 보기</a></>}
    <p className="text-sm leading-relaxed text-gray-500">저장 전 미리보기예요. 저장한 뒤 제출 확인 화면에서 실제 첨부할 PDF를 확인할 수 있어요.</p>
  </section>;
}
