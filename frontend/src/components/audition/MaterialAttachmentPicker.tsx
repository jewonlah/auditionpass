"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Material } from "@/lib/materials/files";

export function MaterialAttachmentPicker({ selected, onChange, disabled }: { selected: string[]; onChange: (ids: string[]) => void; disabled: boolean }) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/materials", { signal: controller.signal, cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("unavailable");
      const result = await response.json(); setMaterials(result.materials); setState("ready");
    }).catch(() => { if (!controller.signal.aborted) setState("error"); });
    return () => controller.abort();
  }, [attempt]);
  return <fieldset disabled={disabled} className="space-y-2 rounded-xl border border-gray-200 p-4">
    <legend className="px-1 font-semibold">보관함 자료 추가 첨부 <span className="font-normal text-gray-500">선택</span></legend>
    <p className="text-sm text-gray-600">기본 프로필 PDF와 함께 최대 3개를 보내요. 선택한 파일은 모집 담당자에게 전달돼요.</p>
    {state === "loading" ? <p role="status" className="text-sm text-gray-500">자료를 불러오고 있어요…</p> : null}
    {state === "error" ? <div role="alert"><p className="text-sm">보관함을 불러오지 못했어요. 추가 파일 없이도 지원할 수 있어요.</p><button type="button" onClick={() => { setState("loading"); setAttempt((value) => value + 1); }} className="min-h-11 font-semibold text-primary">다시 불러오기</button></div> : null}
    {state === "ready" && !materials.length ? <Link href="/portfolio/materials" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary">자료 보관함에 파일 올리기</Link> : null}
    <div className="max-h-52 overflow-y-auto">{materials.map((material) => <label key={material.id} className="flex min-h-11 items-center gap-3 py-2 text-sm"><input type="checkbox" checked={selected.includes(material.id)} disabled={disabled || (!selected.includes(material.id) && selected.length >= 3)} onChange={(event) => onChange(event.target.checked ? [...selected, material.id] : selected.filter((id) => id !== material.id))} className="h-5 w-5 shrink-0 accent-primary" /><span className="min-w-0 break-all">{material.name}</span></label>)}</div>
    <p className="text-sm text-gray-500">추가 첨부 {selected.length}개 선택</p>
  </fieldset>;
}
