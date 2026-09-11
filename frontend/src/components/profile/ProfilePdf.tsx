"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

export function ProfilePdf({ versionId }: { versionId: string }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  async function prepare() {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/profile/pdf?versionId=${versionId}`);
      if (!res.ok) { const data = await res.json(); throw Error(data.error); }
      const blob = await res.blob();
      setUrl(URL.createObjectURL(blob));
    } catch (error) { setError(error instanceof Error ? error.message : "PDF를 준비하지 못했습니다."); }
    finally { setLoading(false); }
  }
  return <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
    <p className="text-sm leading-relaxed text-gray-600">사진과 한글 글꼴이 포함된 PDF예요. 지원할 때 같은 파일이 첨부됩니다.</p>
    {!url && <Button type="button" variant="outline" className="w-full" disabled={loading} onClick={prepare}>{loading ? "PDF 만드는 중…" : "제출 PDF 미리보기"}</Button>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {url && <>
      <div className="flex flex-wrap gap-4 text-sm font-semibold text-primary"><a href={url} target="_blank" rel="noopener noreferrer">PDF 크게 보기</a><a href={url} download="profile.pdf">PDF 다운로드</a></div>
      <iframe src={url} title="지원에 첨부되는 프로필 PDF" className="h-96 w-full rounded-lg border border-gray-200" />
    </>}
  </div>;
}
